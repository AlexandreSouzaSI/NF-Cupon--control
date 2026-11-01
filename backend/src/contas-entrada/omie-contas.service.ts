import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BillPaymentMethod, BillStatus, PayableType, PixKeyType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCategoryName } from '../bill-categories/bill-categories.service';
import { BillsNfService } from '../bills/bills-nf.service';
import { vencimentoUtil } from '../common/dias-uteis';
import { decryptSecret, encryptSecret } from '../stores/certificate-crypto.util';
import { normalizeSupplierName } from '../suppliers/suppliers.service';
import { empresaDo, exigirGestor, lojasPermitidas, lojaValida, so } from './entrada.util';
import { OmieApi, OmieErro, semRegistros } from './omie-api';

// =============================================================================
// Integração Omie → Contas a Pagar, uma por bar (cada CNPJ tem o seu App Key
// / App Secret). O botão "Buscar tudo do Omie" puxa TODAS as contas a pagar
// (pagas, em aberto, canceladas) com fornecedor, categoria, código de barras,
// chave PIX e dados bancários do fornecedor, e a data/valor de pagamento.
//
// Pode rodar quantas vezes quiser: cada conta guarda o código do Omie
// (Bill.omieCodigo), então rodar de novo atualiza em vez de duplicar.
// Contas pagas aqui no sistema continuam pagas mesmo se no Omie ainda
// estiverem em aberto.
// =============================================================================

// Categoria do Omie → categoria daqui (e o grupo da tela de Contas a Pagar).
const CATEGORIAS_OMIE: Record<string, [string, string | null]> = {
    'compras de mercadorias para revenda': ['Mercadorias para revenda', 'REVENDA'],
    'compras de materia prima': ['Matéria-prima (compras)', 'MATERIA_PRIMA'],
    aluguel: ['Aluguel', 'DESPESAS_FIXAS'],
    'agua e esgoto': ['Água', 'DESPESAS_FIXAS'],
    'energia eletrica': ['Luz', 'DESPESAS_FIXAS'],
    telefonia: ['Telefone', 'DESPESAS_FIXAS'],
    internet: ['Internet', 'DESPESAS_FIXAS'],
    seguros: ['Seguros', 'DESPESAS_FIXAS'],
    limpeza: ['Limpeza e dedetização', 'SERVICOS'],
    contabilidade: ['Contabilidade', 'SERVICOS'],
    'compra de servicos': ['Serviços contratados', 'SERVICOS'],
    'manutencao de imobilizado': ['Manutenção', 'SERVICOS'],
    veiculos: ['Veículos', 'SERVICOS'],
    'simples nacional (das)': ['Simples Nacional (DAS)', 'IMPOSTOS'],
    iptu: ['IPTU', 'IMPOSTOS'],
    icms: ['Impostos e guias', 'IMPOSTOS'],
    irpj: ['Impostos e guias', 'IMPOSTOS'],
    'contribuicao social': ['Impostos e guias', 'IMPOSTOS'],
    fgts: ['Impostos e guias', 'IMPOSTOS'],
    inss: ['Impostos e guias', 'IMPOSTOS'],
    salarios: ['Salários', 'FUNCIONARIOS'],
    adiantamento: ['Adiantamento salarial', 'FUNCIONARIOS'],
    rescisoes: ['Rescisões', 'FUNCIONARIOS'],
    'pensao alimenticia': ['Pensão alimentícia', 'FUNCIONARIOS'],
    'outros beneficios': ['Vale-transporte e benefícios', 'FUNCIONARIOS'],
    'cartao de credito': ['Cartão de crédito', null],
    'pagamento de emprestimos': ['Empréstimos', 'SOCIOS'],
};

// As observações da conta começam com o bloco do Omie (reescrito a cada
// busca); o que vier depois dessa linha (anotações feitas aqui, baixa pela
// conciliação...) é preservado.
const FIM_BLOCO_OMIE = '— fim dos dados do Omie —';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown) => {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
    const s = txt(v);
    if (!s) return 0;
    const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
// Omie manda data como dd/mm/aaaa.
function dataBr(v: unknown): Date | null {
    const s = txt(v);
    let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
    if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00.000Z`);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
    return null;
}
const diaIso = (d: Date) => d.toISOString().slice(0, 10);
const diaBr = (d: Date) => `${diaIso(d).slice(8, 10)}/${diaIso(d).slice(5, 7)}/${diaIso(d).slice(0, 4)}`;
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normal = (t: string) => semAcento(t).trim().replace(/\s+/g, ' ').toLowerCase();

function tipoChavePix(chave: string): PixKeyType {
    const c = chave.trim();
    if (/@/.test(c)) return PixKeyType.EMAIL;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return PixKeyType.EVP;
    const d = so(c);
    if (/^\+/.test(c) || (d.length >= 12 && d.length <= 13 && d.startsWith('55'))) return PixKeyType.PHONE;
    if (d.length === 14 && d === c.replace(/[.\-/\s]/g, '')) return PixKeyType.CNPJ;
    if (d.length === 11 && /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(c)) return PixKeyType.CPF;
    if (d.length === 10 || d.length === 11) return PixKeyType.PHONE;
    return PixKeyType.RANDOM;
}

type Pagamento = { data: Date | null; valorPago: number; valorAberto: number; juros: number; multa: number; desconto: number; liquidado: boolean };

export type ResultadoOmie = {
    status: 'RODANDO' | 'OK' | 'ERRO';
    etapa?: string;
    inicio: string;
    fim?: string;
    erro?: string;
    contasNoOmie?: number;
    criadas?: number;
    atualizadas?: number;
    vinculadasPlanilha?: number;
    removidas?: number;
    pagas?: number;
    emAberto?: number;
    canceladas?: number;
    comCodigoBarras?: number;
    comPix?: number;
    fornecedoresNovos?: number;
    categoriasNovas?: number;
    avisos?: string[];
    // Nomes dos campos que o Omie devolveu (ajuda a diagnosticar se algo
    // não veio).
    camposConta?: string[];
    camposMovimento?: string[];
};

@Injectable()
export class OmieContasService {
    private readonly logger = new Logger(OmieContasService.name);
    private readonly rodando = new Set<string>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly billsNf: BillsNfService,
    ) { }

    // ---------------------------------------------------------------- telas

    async listar(user: any) {
        exigirGestor(user);
        const empresaId = empresaDo(user);
        const permitidas = await lojasPermitidas(this.prisma, user);
        const lojas = await this.prisma.store.findMany({
            where: { empresaId, active: true, ...(permitidas ? { id: { in: permitidas } } : {}) },
            select: { id: true, name: true, cnpj: true },
            orderBy: { name: 'asc' },
        });
        const ids = lojas.map((l) => l.id);
        const [integracoes, contagem] = await Promise.all([
            this.prisma.omieIntegracao.findMany({ where: { storeId: { in: ids } } }),
            this.prisma.bill.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, omieCodigo: { not: null } }, _count: { _all: true } }),
        ]);
        return lojas.map((l) => {
            const i = integracoes.find((x) => x.storeId === l.id);
            const resultado = (i?.resultado ?? null) as ResultadoOmie | null;
            const rodando = this.rodando.has(l.id);
            return {
                storeId: l.id,
                nome: l.name,
                cnpj: l.cnpj,
                configurado: Boolean(i),
                appKey: i?.appKey ?? null,
                empresaOmie: i?.empresaOmie ?? null,
                ultimaSincronizacao: i?.ultimaSincronizacao ?? null,
                rodando,
                // Se o servidor reiniciou no meio, a busca parou.
                resultado: resultado && resultado.status === 'RODANDO' && !rodando
                    ? { ...resultado, status: 'ERRO', erro: 'A busca foi interrompida (o servidor reiniciou). Clique de novo.' }
                    : resultado,
                contasDoOmie: contagem.find((c) => c.storeId === l.id)?._count._all ?? 0,
            };
        });
    }

    async salvar(user: any, storeId: string, body: { appKey?: string; appSecret?: string }) {
        exigirGestor(user);
        const empresaId = empresaDo(user);
        await lojaValida(this.prisma, user, empresaId, storeId);
        const atual = await this.prisma.omieIntegracao.findUnique({ where: { storeId } });

        const appKey = txt(body?.appKey).replace(/\s/g, '');
        const appSecretNovo = txt(body?.appSecret).replace(/\s/g, '');
        if (!appKey) throw new BadRequestException('Informe o App Key.');
        if (!appSecretNovo && !atual) throw new BadRequestException('Informe o App Secret.');
        const appSecret = appSecretNovo || decryptSecret(atual!.appSecretCifrado as any);

        // Testa as chaves antes de salvar e confere o CNPJ.
        const api = new OmieApi(appKey, appSecret);
        let empresaOmie: string | null = null;
        let cnpjOmie: string[] = [];
        try {
            const r = await api.chamar('geral/empresas/', 'ListarEmpresas', { pagina: 1, registros_por_pagina: 50, apenas_importado_api: 'N' });
            const empresas: any[] = r?.empresas_cadastro ?? [];
            cnpjOmie = empresas.map((e) => so(e.cnpj)).filter(Boolean);
            empresaOmie = empresas.map((e) => [txt(e.razao_social) || txt(e.nome_fantasia), txt(e.cnpj)].filter(Boolean).join(' — ')).join(' | ') || null;
        } catch (e: any) {
            try {
                await api.chamar('geral/categorias/', 'ListarCategorias', { pagina: 1, registros_por_pagina: 1 });
            } catch (e2: any) {
                if (!semRegistros(e2)) throw new BadRequestException(`O Omie recusou essas chaves: ${e2?.message ?? e?.message}`);
            }
        }

        const loja = await this.prisma.store.findUnique({ where: { id: storeId }, select: { cnpj: true, name: true } });
        const aviso = loja?.cnpj && cnpjOmie.length && !cnpjOmie.includes(so(loja.cnpj))
            ? `Atenção: essas chaves são do CNPJ ${cnpjOmie.join(', ')}, mas a loja ${loja.name} está com CNPJ ${loja.cnpj}. Confira se colou as chaves do bar certo.`
            : null;

        let cifrado;
        try {
            cifrado = encryptSecret(appSecret);
        } catch (e: any) {
            throw new BadRequestException(`Não consegui guardar a chave com segurança: ${e?.message}`);
        }
        const dados = {
            appKey,
            appSecretCifrado: cifrado as unknown as Prisma.InputJsonValue,
            empresaOmie,
        };
        await this.prisma.omieIntegracao.upsert({
            where: { storeId },
            create: { storeId, ...dados },
            update: dados,
        });
        return { ok: true, empresaOmie, aviso };
    }

    async remover(user: any, storeId: string) {
        exigirGestor(user);
        await lojaValida(this.prisma, user, empresaDo(user), storeId);
        if (this.rodando.has(storeId)) throw new ConflictException('Espere a busca terminar.');
        await this.prisma.omieIntegracao.deleteMany({ where: { storeId } });
        return { ok: true };
    }

    async sincronizar(user: any, storeId: string, body: { limparAntigas?: boolean }) {
        exigirGestor(user);
        const empresaId = empresaDo(user);
        await lojaValida(this.prisma, user, empresaId, storeId);
        const integ = await this.prisma.omieIntegracao.findUnique({ where: { storeId } });
        if (!integ) throw new NotFoundException('Cadastre o App Key e o App Secret desse bar primeiro.');
        if (this.rodando.has(storeId)) throw new ConflictException('A busca desse bar já está rodando.');
        if (!user?.id) throw new BadRequestException('Usuário inválido.');

        this.rodando.add(storeId);
        const resultado: ResultadoOmie = { status: 'RODANDO', etapa: 'Começando…', inicio: new Date().toISOString(), avisos: [] };
        await this.gravar(storeId, resultado);

        // Roda em segundo plano — a tela acompanha pelo GET.
        void this.executar(storeId, empresaId, user.id, integ.appKey, decryptSecret(integ.appSecretCifrado as any), body?.limparAntigas !== false, resultado)
            .catch(async (e: any) => {
                this.logger.error(`Busca do Omie da loja ${storeId} falhou: ${e?.message ?? e}`);
                resultado.status = 'ERRO';
                resultado.erro = e instanceof OmieErro ? `O Omie respondeu: ${e.message}` : (e?.message ?? String(e));
                resultado.fim = new Date().toISOString();
                await this.gravar(storeId, resultado).catch(() => undefined);
            })
            .finally(() => this.rodando.delete(storeId));

        return { iniciado: true };
    }

    private async gravar(storeId: string, resultado: ResultadoOmie, fim = false) {
        await this.prisma.omieIntegracao.update({
            where: { storeId },
            data: {
                resultado: resultado as unknown as Prisma.InputJsonValue,
                ...(fim ? { ultimaSincronizacao: new Date() } : {}),
            },
        });
    }

    // ---------------------------------------------------------------- busca

    async executar(
        storeId: string,
        empresaId: string,
        userId: string,
        appKey: string,
        appSecret: string,
        limparAntigas: boolean,
        r: ResultadoOmie,
    ) {
        const api = new OmieApi(appKey, appSecret);
        const avisos = (r.avisos ??= []);
        const etapa = async (t: string) => { r.etapa = t; await this.gravar(storeId, r); };

        // 1) Categorias do Omie (código → nome)
        await etapa('Buscando categorias…');
        const categoriasOmie = new Map<string, string>();
        try {
            const itens = await api.todasAsPaginas('geral/categorias/', 'ListarCategorias', {},
                (c) => ({ itens: c?.categoria_cadastro ?? [], totalPaginas: c?.total_de_paginas }));
            for (const c of itens) categoriasOmie.set(txt(c.codigo), txt(c.descricao) || txt(c.descricao_padrao));
        } catch (e: any) {
            avisos.push(`Não consegui as categorias do Omie (${e?.message}). As contas entram sem categoria.`);
        }

        // 2) Contas correntes (pra saber o que é "Caixinha"/dinheiro)
        const contasCorrentes = new Map<string, string>();
        try {
            const itens = await api.todasAsPaginas('geral/contacorrente/', 'ListarContasCorrentes', { apenas_importado_api: 'N' },
                (c) => ({ itens: c?.ListarContasCorrentes ?? c?.conta_corrente_lista ?? [], totalPaginas: c?.total_de_paginas }));
            for (const cc of itens) contasCorrentes.set(txt(cc.nCodCC ?? cc.codigo_conta_corrente), txt(cc.descricao));
        } catch (e: any) {
            avisos.push(`Não consegui as contas correntes do Omie (${e?.message}).`);
        }

        // 3) Fornecedores (nome, CNPJ, dados bancários e chave PIX)
        await etapa('Buscando fornecedores…');
        const clientes = new Map<string, any>();
        try {
            const itensClientes = await api.todasAsPaginas('geral/clientes/', 'ListarClientes', { apenas_importado_api: 'N' },
                (c) => ({ itens: c?.clientes_cadastro ?? [], totalPaginas: c?.total_de_paginas }),
                undefined,
                (p, t) => { r.etapa = `Buscando fornecedores… (página ${p} de ${t})`; });
            for (const c of itensClientes) clientes.set(txt(c.codigo_cliente_omie), c);
        } catch (e: any) {
            avisos.push(`Não consegui os fornecedores do Omie (${e?.message}). As contas entram sem fornecedor e sem chave PIX.`);
        }

        // 4) Contas a pagar (todas: pagas, em aberto, canceladas)
        await etapa('Buscando contas a pagar…');
        const contas: any[] = await api.todasAsPaginas('financas/contapagar/', 'ListarContasPagar', { apenas_importado_api: 'N' },
            (c) => ({ itens: c?.conta_pagar_cadastro ?? [], totalPaginas: c?.total_de_paginas }),
            undefined,
            (p, t) => { r.etapa = `Buscando contas a pagar… (página ${p} de ${t})`; void this.gravar(storeId, r).catch(() => undefined); });
        r.contasNoOmie = contas.length;
        r.camposConta = contas[0] ? Object.keys(contas[0]).sort() : [];

        // 5) Pagamentos (data em que foi pago, valor pago, juros/desconto)
        await etapa('Buscando pagamentos…');
        const pagamentos = new Map<string, Pagamento>();
        try {
            const movimentos: any[] = await api.todasAsPaginas('financas/mf/', 'ListarMovimentos', {},
                (c) => ({ itens: c?.movimentos ?? [], totalPaginas: c?.nTotPaginas ?? c?.total_de_paginas }),
                { pagina: 'nPagina', porPagina: 'nRegPorPagina', tamanho: 500 },
                (p, t) => { r.etapa = `Buscando pagamentos… (página ${p} de ${t})`; void this.gravar(storeId, r).catch(() => undefined); });
            r.camposMovimento = movimentos[0] ? [
                ...Object.keys(movimentos[0].detalhes ?? {}).map((k) => `detalhes.${k}`),
                ...Object.keys(movimentos[0].resumo ?? {}).map((k) => `resumo.${k}`),
            ].sort() : [];
            for (const m of movimentos) {
                const d = m?.detalhes ?? {};
                const s = m?.resumo ?? {};
                const natureza = txt(d.cNatureza).toUpperCase();
                const grupo = txt(d.cGrupo).toUpperCase();
                if (natureza && natureza !== 'P' && !grupo.includes('PAGAR')) continue;
                const codigo = txt(d.nCodTitulo);
                if (!codigo || codigo === '0') continue;
                const atual = pagamentos.get(codigo);
                const dataPag = dataBr(d.dDtPagamento);
                const novo: Pagamento = {
                    data: dataPag && (!atual?.data || dataPag > atual.data) ? dataPag : atual?.data ?? null,
                    valorPago: Math.max(atual?.valorPago ?? 0, num(s.nValPago)),
                    valorAberto: s.nValAberto !== undefined ? num(s.nValAberto) : atual?.valorAberto ?? 0,
                    juros: Math.max(atual?.juros ?? 0, num(s.nJuros)),
                    multa: Math.max(atual?.multa ?? 0, num(s.nMulta)),
                    desconto: Math.max(atual?.desconto ?? 0, num(s.nDesconto)),
                    liquidado: atual?.liquidado || txt(s.cLiquidado).toUpperCase() === 'S',
                };
                pagamentos.set(codigo, novo);
            }
        } catch (e: any) {
            avisos.push(`Não consegui os pagamentos do Omie (${e?.message}). As pagas entram como pagas no vencimento.`);
        }

        // 6) Grava
        await etapa(`Gravando ${contas.length} contas…`);
        await this.gravarContas(storeId, empresaId, userId, contas, { categoriasOmie, contasCorrentes, clientes, pagamentos }, limparAntigas, r);

        // Liga as contas às NFs de entrada que já estão no sistema (pela
        // chave da NF-e que veio do Omie).
        try {
            await etapa('Ligando as contas às NFs do sistema…');
            const v = await this.billsNf.vincularAutomatico(null, storeId);
            if (v.vinculadas) avisos.push(`${v.vinculadas} conta(s) ligada(s) à NF de entrada do sistema.`);
        } catch {
            // não atrapalha a busca
        }

        r.status = 'OK';
        r.etapa = 'Concluída';
        r.fim = new Date().toISOString();
        await this.gravar(storeId, r, true);
    }

    private async gravarContas(
        storeId: string,
        empresaId: string,
        userId: string,
        contas: any[],
        omie: {
            categoriasOmie: Map<string, string>;
            contasCorrentes: Map<string, string>;
            clientes: Map<string, any>;
            pagamentos: Map<string, Pagamento>;
        },
        limparAntigas: boolean,
        r: ResultadoOmie,
    ) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        Object.assign(r, { criadas: 0, atualizadas: 0, vinculadasPlanilha: 0, removidas: 0, pagas: 0, emAberto: 0, canceladas: 0, comCodigoBarras: 0, comPix: 0, fornecedoresNovos: 0, categoriasNovas: 0 });

        // --- fornecedores e categorias que já existem
        const fornecedores = await this.prisma.supplier.findMany({ where: { empresaId }, select: { id: true, nameNormalized: true, cnpj: true } });
        const fornPorDoc = new Map(fornecedores.filter((f) => so(f.cnpj)).map((f) => [so(f.cnpj), f.id]));
        const fornPorNome = new Map(fornecedores.map((f) => [f.nameNormalized, f.id]));
        const categorias = await this.prisma.billCategory.findMany({ where: { empresaId }, select: { id: true, nameNormalized: true } });
        const catPorNome = new Map(categorias.map((c) => [c.nameNormalized, c.id]));

        const fornecedorId = async (nome: string, doc: string): Promise<string | null> => {
            if (!nome) return null;
            if (doc && fornPorDoc.has(doc)) return fornPorDoc.get(doc)!;
            const n = normalizeSupplierName(nome);
            if (fornPorNome.has(n)) return fornPorNome.get(n)!;
            const criado = await this.prisma.supplier.create({
                data: { name: nome.slice(0, 200), nameNormalized: n, cnpj: doc.length === 11 || doc.length === 14 ? doc : null, empresaId },
            });
            r.fornecedoresNovos!++;
            fornPorNome.set(n, criado.id);
            if (doc) fornPorDoc.set(doc, criado.id);
            return criado.id;
        };
        const categoriaId = async (nomeOmie: string): Promise<string | null> => {
            if (!nomeOmie) return null;
            const [nome, grupo] = CATEGORIAS_OMIE[normal(nomeOmie)] ?? [nomeOmie, null];
            const n = normalizeCategoryName(nome);
            if (catPorNome.has(n)) return catPorNome.get(n)!;
            const criada = await this.prisma.billCategory.create({ data: { name: nome.slice(0, 120), nameNormalized: n, group: grupo, empresaId } });
            r.categoriasNovas!++;
            catPorNome.set(n, criada.id);
            return criada.id;
        };

        // --- contas que já existem nessa loja
        const existentes = await this.prisma.bill.findMany({
            where: { storeId },
            select: {
                id: true, omieCodigo: true, status: true, paidAt: true, value: true, dueDate: true, dueDateOriginal: true, notes: true,
                supplierId: true, categoryId: true, supplier: { select: { nameNormalized: true, cnpj: true } },
            },
        });
        const porCodigo = new Map(existentes.filter((b) => b.omieCodigo).map((b) => [b.omieCodigo!, b]));
        // Contas que vieram da planilha do Omie (script) — casadas pelo
        // fornecedor + vencimento + valor, pra não duplicar.
        const chavePlanilha = (forn: string, venc: Date, valor: number) => `${forn}|${diaIso(venc)}|${Math.round(valor * 100)}`;
        const planilha = new Map<string, (typeof existentes)[number][]>();
        for (const b of existentes) {
            if (b.omieCodigo || !b.notes?.startsWith('Importada do Omie.')) continue;
            for (const forn of [so(b.supplier?.cnpj), b.supplier?.nameNormalized].filter(Boolean) as string[]) {
                const k = chavePlanilha(forn, b.dueDateOriginal ?? b.dueDate, Number(b.value));
                planilha.set(k, [...(planilha.get(k) ?? []), b]);
            }
        }
        const usadas = new Set<string>();
        const vistosNoOmie = new Set<string>();

        let n = 0;
        for (const c of contas) {
            n++;
            if (n % 100 === 0) {
                r.etapa = `Gravando contas… (${n} de ${contas.length})`;
                await this.gravar(storeId, r).catch(() => undefined);
            }
            const codigo = txt(c.codigo_lancamento_omie);
            const venc = dataBr(c.data_vencimento);
            if (!codigo || !venc) continue;
            vistosNoOmie.add(codigo);

            const cli = omie.clientes.get(txt(c.codigo_cliente_fornecedor)) ?? {};
            const fornNome = txt(cli.razao_social) || txt(cli.nome_fantasia);
            const fornDoc = so(cli.cnpj_cpf);
            const banco = cli.dadosBancarios ?? {};
            const pixKey = txt(banco.cChavePix) || null;
            const nomeCategoriaOmie = omie.categoriasOmie.get(txt(c.codigo_categoria))
                ?? omie.categoriasOmie.get(txt(c.categorias?.[0]?.codigo_categoria)) ?? '';
            const ccNome = omie.contasCorrentes.get(txt(c.id_conta_corrente)) ?? '';
            const tipoDoc = txt(c.codigo_tipo_documento).toUpperCase();
            const barcode = so(c.codigo_barras_ficha_compensacao) || null;
            const pag = omie.pagamentos.get(codigo);
            const statusOmie = normal(txt(c.status_titulo)).toUpperCase();

            const cancelada = statusOmie.includes('CANCEL');
            const paga = !cancelada && (/^(PAGO|LIQUIDADO|BAIXADO)/.test(statusOmie) || Boolean(pag?.liquidado));
            const parcial = !paga && !cancelada && !!pag && pag.valorPago > 0 && pag.valorAberto > 0;
            const valorDoc = num(c.valor_documento);
            const valor = parcial ? pag!.valorAberto : valorDoc;

            const type: PayableType = barcode || /BOL/.test(tipoDoc) ? PayableType.BOLETO : pixKey || /PIX/.test(tipoDoc) ? PayableType.PIX : PayableType.NO_BILL;
            const paymentMethod: BillPaymentMethod = /caixinha|caixa|dinheiro/i.test(ccNome)
                ? BillPaymentMethod.CASH
                : type === PayableType.BOLETO ? BillPaymentMethod.BANK_SLIP
                    : type === PayableType.PIX ? BillPaymentMethod.PIX : BillPaymentMethod.BANK_TRANSFER;

            const nf = txt(c.numero_documento_fiscal).replace(/^0+/, '');
            const parcela = txt(c.numero_parcela);
            const descricao = [
                fornNome || 'Conta do Omie',
                nf ? `NF ${nf}` : null,
                parcela && !/^0*1\/0*1$/.test(parcela) ? `parcela ${parcela}` : null,
            ].filter(Boolean).join(' — ').slice(0, 250);

            const blocoOmie = [
                'Importada do Omie (API).',
                `Código no Omie: ${codigo} · Situação no Omie: ${txt(c.status_titulo) || '-'}`,
                `Categoria no Omie: ${nomeCategoriaOmie || '-'} · Conta corrente: ${ccNome || '-'} · Documento: ${tipoDoc || '-'}${txt(c.numero_documento) ? ` nº ${txt(c.numero_documento)}` : ''}`,
                `Emissão ${txt(c.data_emissao) || '-'} · Previsão ${txt(c.data_previsao) || '-'} · Entrada ${txt(c.data_entrada) || '-'}`,
                fornDoc ? `CNPJ/CPF do fornecedor: ${fornDoc}` : null,
                txt(c.chave_nfe) ? `Chave da NF-e: ${txt(c.chave_nfe)}` : null,
                parcial ? `Pago parcialmente no Omie: ${brl(pag!.valorPago)} de ${brl(valorDoc)} — falta ${brl(pag!.valorAberto)}.` : null,
                paga && pag ? `Pago no Omie${pag.data ? ` em ${diaBr(pag.data)}` : ''}: ${brl(pag.valorPago || valorDoc)}${pag.juros ? ` · juros ${brl(pag.juros)}` : ''}${pag.multa ? ` · multa ${brl(pag.multa)}` : ''}${pag.desconto ? ` · desconto ${brl(pag.desconto)}` : ''}` : null,
                txt(c.observacao) ? `Observação no Omie: ${txt(c.observacao)}` : null,
                FIM_BLOCO_OMIE,
            ].filter(Boolean).join('\n');

            const dadosPagamento = {
                barcode,
                pixKey,
                pixKeyType: pixKey ? tipoChavePix(pixKey) : null,
                bankName: txt(banco.codigo_banco) || null,
                bankAgency: txt(banco.agencia) || null,
                bankAccount: txt(banco.conta_corrente) || null,
                beneficiary: txt(banco.nome_titular) || fornNome || null,
            };
            if (barcode) r.comCodigoBarras!++;
            if (pixKey) r.comPix!++;

            // Acha a conta daqui: pelo código do Omie ou, na 1ª vez, pela
            // conta da planilha.
            let existente = porCodigo.get(codigo);
            let veioDaPlanilha = false;
            if (!existente) {
                for (const forn of [fornDoc, normalizeSupplierName(fornNome)].filter(Boolean)) {
                    const candidatas = (planilha.get(chavePlanilha(forn, venc, valor)) ?? planilha.get(chavePlanilha(forn, venc, valorDoc)) ?? [])
                        .filter((b) => !usadas.has(b.id));
                    if (candidatas.length) { existente = candidatas[0]; veioDaPlanilha = true; break; }
                }
            }

            const pagaAqui = existente?.status === BillStatus.PAID;
            let status: BillStatus;
            let paidAt: Date | null | undefined;
            if (pagaAqui) { status = BillStatus.PAID; paidAt = undefined; }
            else if (cancelada) { status = BillStatus.CANCELED; paidAt = null; }
            else if (paga) { status = BillStatus.PAID; paidAt = pag?.data ?? venc; }
            else { status = vencimentoUtil(venc).dueDate < hoje ? BillStatus.OVERDUE : BillStatus.OPEN; paidAt = null; }
            // Em aberto: vencimento em fim de semana/feriado vai pro próximo dia útil.
            const vencGravar = status === BillStatus.PAID || status === BillStatus.CANCELED ? { dueDate: venc, dueDateOriginal: null } : vencimentoUtil(venc);

            if (status === BillStatus.PAID) r.pagas!++;
            else if (status === BillStatus.CANCELED) r.canceladas!++;
            else r.emAberto!++;

            if (existente) {
                usadas.add(existente.id);
                const resto = !veioDaPlanilha && existente.notes?.includes(FIM_BLOCO_OMIE)
                    ? existente.notes.slice(existente.notes.indexOf(FIM_BLOCO_OMIE) + FIM_BLOCO_OMIE.length).trim()
                    : '';
                const data: Prisma.BillUncheckedUpdateInput = {
                    omieCodigo: codigo,
                    description: descricao,
                    type,
                    paymentMethod,
                    ...dadosPagamento,
                    notes: [blocoOmie, resto].filter(Boolean).join('\n'),
                    status,
                    ...(paidAt !== undefined ? { paidAt } : {}),
                    ...(status === BillStatus.PAID ? { queuedForPaymentAt: null } : {}),
                    // Conta já paga aqui: não mexe em valor/vencimento.
                    ...(!pagaAqui ? { value: valor, dueDate: vencGravar.dueDate, dueDateOriginal: vencGravar.dueDateOriginal } : {}),
                    supplierId: existente.supplierId ?? (await fornecedorId(fornNome, fornDoc)),
                    categoryId: existente.categoryId ?? (await categoriaId(nomeCategoriaOmie)),
                };
                await this.prisma.bill.update({ where: { id: existente.id }, data });
                if (veioDaPlanilha) r.vinculadasPlanilha!++;
                else r.atualizadas!++;
            } else {
                await this.prisma.bill.create({
                    data: {
                        omieCodigo: codigo,
                        description: descricao,
                        value: valor,
                        type,
                        paymentMethod,
                        dueDate: vencGravar.dueDate,
                        dueDateOriginal: vencGravar.dueDateOriginal,
                        status,
                        paidAt: paidAt ?? null,
                        ...dadosPagamento,
                        storeId,
                        supplierId: await fornecedorId(fornNome, fornDoc),
                        categoryId: await categoriaId(nomeCategoriaOmie),
                        launchedById: userId,
                        notes: blocoOmie,
                    },
                });
                r.criadas!++;
            }
        }

        // Remove as contas EM ABERTO que não estão mais no Omie: as da
        // planilha que não casaram e as do Omie que foram excluídas lá.
        // Pagas nunca são apagadas.
        if (limparAntigas) {
            const remover = existentes
                .filter((b) => !usadas.has(b.id))
                .filter((b) => b.status !== BillStatus.PAID)
                .filter((b) => (b.omieCodigo ? !vistosNoOmie.has(b.omieCodigo) : b.notes?.startsWith('Importada do Omie.')))
                .map((b) => b.id);
            if (remover.length) {
                await this.prisma.$transaction([
                    this.prisma.incomingGoodsNf.updateMany({ where: { billId: { in: remover } }, data: { billId: null } }),
                    this.prisma.incomingServiceNf.updateMany({ where: { billId: { in: remover } }, data: { billId: null } }),
                    this.prisma.pagamentoAvisado.updateMany({ where: { billId: { in: remover } }, data: { billId: null } }),
                    this.prisma.conciliacaoExtratoItem.updateMany({ where: { billId: { in: remover } }, data: { billId: null, baixaFeita: false } }),
                    this.prisma.bill.deleteMany({ where: { id: { in: remover } } }),
                ]);
                r.removidas = remover.length;
            }
        }
    }
}
