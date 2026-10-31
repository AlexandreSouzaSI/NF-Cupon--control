import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillPaymentMethod, BillStatus, PayableType, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCategoryName } from '../bill-categories/bill-categories.service';
import { ExtratoLido, juntarExtratos, lerExtrato } from './extrato-parser';
import { LimiteEnvios, empresaDo, lojaValida, lojasPermitidas, nomeDo, norm, so } from './entrada.util';

// =============================================================================
// Conciliação do Extrato: importa o extrato do mês (de uma loja), sugere a
// categoria de cada pagamento (conta a pagar que já existe, vínculos, nome do
// fornecedor, palavras como CEMIG/COPASA/DAS), deixa classificar na tela ou
// por link e, no "Aplicar", dá baixa nas contas que já existiam e cria as
// que faltam (já pagas) em Contas a Pagar, na categoria escolhida.
// =============================================================================

export type Parte = { k: string; v: number };
export const FIXOS = ['NAO', 'JA_LANCADO'] as const;

const cent = (v: number) => Math.round(v * 100);

function dividirIgual(valor: number, ks: string[]): Parte[] {
    const t = cent(valor);
    const b = Math.floor(t / ks.length);
    return ks.map((k, i) => ({ k, v: (i === ks.length - 1 ? t - b * (ks.length - 1) : b) / 100 }));
}

// Palavras do extrato → categoria padrão (nome normalizado) ou NAO.
const REGRAS: { re: RegExp; categoria: string }[] = [
    { re: /\b(APLICACAO|RESGATE|TRANSF(ERENCIA)? ENTRE CONTAS|MESMA TITULARIDADE|INVEST)/, categoria: 'NAO' },
    { re: /\b(CEMIG|ENEL|CPFL|LIGHT S|ENERGISA|COELBA|CELESC|COPEL|ELETROPAULO|EQUATORIAL|NEOENERGIA|ENERGIA ELETRICA|CELPE|COSERN)\b/, categoria: 'luz' },
    { re: /\b(COPASA|SABESP|CEDAE|SANEPAR|EMBASA|COMPESA|CAGECE|CASAN|SANEAMENTO|AGUA E ESGOTO|SAAE|DMAE)\b/, categoria: 'agua' },
    { re: /\b(COMGAS|NATURGY|ULTRAGAZ|LIQUIGAS|SUPERGASBRAS|COPAGAZ|NACIONAL GAS|GAS NATURAL)\b/, categoria: 'gas' },
    { re: /\b(INTERNET|FIBRA|BRISANET|ALGAR|DESKTOP S|PROVEDOR)\b/, categoria: 'internet' },
    { re: /\b(VIVO|CLARO|TIM S|TELEFONICA|OI S A|OI MOVEL)\b/, categoria: 'telefone' },
    { re: /\b(ALUGUEL|LOCACAO|IMOBILIARIA)\b/, categoria: 'aluguel' },
    { re: /\bCONDOMINIO\b/, categoria: 'condominio' },
    { re: /\bIPTU\b/, categoria: 'iptu' },
    { re: /\b(DAS|SIMPLES NACIONAL|PGDAS)\b/, categoria: 'simples nacional (das)' },
    { re: /\b(DARF|RECEITA FEDERAL|GPS|INSS|FGTS|SEFAZ|ICMS|ISSQN|GNRE|DAE)\b/, categoria: 'impostos e guias' },
    { re: /\b(ALVARA|TAXA DE FISCALIZACAO|TFE|CORPO DE BOMBEIROS|PREFEITURA)\b/, categoria: 'taxas e alvaras' },
    { re: /\b(CIELO|STONE|GETNET|PAGSEGURO|SUMUP|REDE S A|MERCADO ?PAGO|ANTECIPACAO|MDR)\b/, categoria: 'taxas de cartao' },
    { re: /\b(TARIFA|CESTA|PACOTE DE SERVICOS|IOF|ENCARGOS?|JUROS|MANUTENCAO DE CONTA)\b/, categoria: 'tarifas bancarias' },
    { re: /\b(CONTABIL|CONTABILIDADE|CONTADOR|ESCRITORIO CONTABIL)\b/, categoria: 'contabilidade' },
    { re: /\b(AMBEV|HEINEKEN|PETROPOLIS|KIRIN|CERVEJARIA)\b/, categoria: 'cervejas' },
    { re: /\b(COCA|SPAL|FEMSA|SOLAR BR|REFRIGERANTES?|AGUA MINERAL)\b/, categoria: 'refrigerantes e agua' },
    { re: /\b(DIAGEO|PERNOD|BACARDI|CAMPARI|DESTILARIA|CACHACA|VODKA|WHISK)/, categoria: 'destilados' },
    { re: /\b(SALARIO|FOLHA DE PAG|ADIANTAMENTO SALARIAL|FERIAS|RESCISAO|13 SALARIO)\b/, categoria: 'salarios' },
    { re: /\b(PRO ?-?LABORE|RETIRADA (DE )?SOCIO|DISTRIBUICAO DE LUCROS)\b/, categoria: 'retirada / pro-labore' },
    { re: /\b(IFOOD|GOOGLE|META|FACEBOOK|INSTAGRAM|ANUNCIO)\b/, categoria: 'marketing' },
    { re: /\b(TOTVS|LINX|COLIBRI|MEEP|SAIPOS|CONSUMER|SISTEMA|SOFTWARE|ASSINATURA|MICROSOFT|ADOBE)\b/, categoria: 'sistemas e assinaturas' },
];
const GENERICAS = new Set(['LTDA', 'EIRELI', 'COMERCIO', 'SERVICOS', 'PAGAMENTO', 'DISTRIBUIDORA', 'ALIMENTOS', 'INDUSTRIA', 'BRASIL', 'BEBIDAS']);
const palavrasNome = (s: string) => norm(s).split(/[^A-Z0-9]+/).filter((w) => w.length >= 4 && !GENERICAS.has(w));

// "CEMIG — PAGAMENTO PIX ... CEMIG" vira só a linha mais completa.
function descricaoConta(nome: string, descricao: string) {
    if (!descricao) return nome;
    const n = norm(nome).trim(), d = norm(descricao).trim();
    if (!n || d.includes(n)) return descricao;
    if (n.includes(d)) return nome;
    return `${nome} — ${descricao}`;
}

const formaDoTipo = (tipo: string): { type: PayableType; paymentMethod: BillPaymentMethod } =>
    tipo === 'PIX' ? { type: 'PIX', paymentMethod: 'PIX' }
        : tipo === 'BOLETO' ? { type: 'BOLETO', paymentMethod: 'BANK_SLIP' }
            : tipo === 'TRANSFERENCIA' ? { type: 'NO_BILL', paymentMethod: 'BANK_TRANSFER' }
                : { type: 'NO_BILL', paymentMethod: 'COMPANY_ACCOUNT' };

@Injectable()
export class ConciliacaoExtratoService {
    private limite = new LimiteEnvios(120);

    constructor(private readonly prisma: PrismaService) { }

    private categorias(empresaId: string) {
        return this.prisma.billCategory.findMany({
            where: { empresaId, active: true },
            select: { id: true, name: true, nameNormalized: true, group: true },
            orderBy: { name: 'asc' },
        });
    }

    private async daEmpresa(user: any, id: string) {
        const empresaId = empresaDo(user);
        const c = await this.prisma.conciliacaoExtrato.findFirst({ where: { id, empresaId } });
        if (!c) throw new NotFoundException('Conciliação não encontrada.');
        await lojaValida(this.prisma, user, empresaId, c.storeId);
        return c;
    }

    // ---------------------------------------------------------------- importar
    async importar(user: any, storeId: string | undefined, arquivos: Express.Multer.File[]) {
        const empresaId = empresaDo(user);
        const loja = await lojaValida(this.prisma, user, empresaId, storeId);
        if (!loja) throw new BadRequestException('Escolha a loja (conta bancária) deste extrato no seletor do topo.');
        if (!arquivos?.length) throw new BadRequestException('Envie o extrato do mês.');
        const lidos: ExtratoLido[] = [];
        for (const a of arquivos) {
            try {
                lidos.push(lerExtrato(a.buffer, a.originalname));
            } catch (e: any) {
                throw new BadRequestException(`${a.originalname}: ${e?.message ?? 'não consegui ler o arquivo.'}`);
            }
        }
        if (lidos.filter((l) => l.formato === 'COMPLETO').length > 1 || lidos.filter((l) => l.formato === 'PIX').length > 1) {
            throw new BadRequestException('Mande no máximo 1 extrato completo (OFX ou Excel) e 1 relatório de Pix.');
        }
        const j = juntarExtratos(lidos);
        const mes = j.mes;
        if (!mes) throw new BadRequestException('O extrato não tem movimentações.');
        const pagamentos = j.movimentos.filter((m) => m.valor < 0);
        const recebimentos = j.movimentos.filter((m) => m.valor > 0);
        const soma = (l: typeof pagamentos) => Math.round(l.reduce((s, m) => s + Math.abs(m.valor), 0) * 100) / 100;

        const conc = await this.prisma.conciliacaoExtrato.create({
            data: {
                empresaId,
                storeId: loja,
                mes,
                banco: j.banco,
                arquivos: arquivos.map((a) => a.originalname),
                totalPagamentos: soma(pagamentos),
                totalRecebimentos: soma(recebimentos),
                nPagamentos: pagamentos.length,
                nRecebimentos: recebimentos.length,
                saldoAnterior: j.saldoAnterior,
                saldoFinal: j.saldoFinal,
                criadoPor: nomeDo(user),
                itens: {
                    create: pagamentos.map((m, i) => ({
                        ordem: i + 1,
                        data: new Date(`${m.data}T15:00:00.000Z`),
                        hora: m.hora,
                        tipo: m.tipo,
                        nome: m.nome.slice(0, 200),
                        documento: m.documento,
                        descricao: (m.descricao === m.linha && m.tipo === 'PIX' ? '' : m.descricao).slice(0, 500),
                        valor: Math.abs(m.valor),
                    })),
                },
            },
        });
        const auto = await this.classificarAuto(conc.id);
        const avisos: string[] = [];
        if (j.pixSobrando > 0) avisos.push(`${j.pixSobrando} Pix do relatório não foram achados no extrato completo (data ou valor diferentes).`);
        return { id: conc.id, mes, pagamentos: pagamentos.length, classificados: auto, avisos };
    }

    // ------------------------------------------------- classificação automática
    // Só mexe no que é automático ou pendente (o que foi classificado à mão ou
    // pelo link fica).
    async classificarAuto(conciliacaoId: string) {
        const conc = await this.prisma.conciliacaoExtrato.findUniqueOrThrow({ where: { id: conciliacaoId } });
        const empresaId = conc.empresaId;
        const [itens, categorias, vinculos, lojas] = await Promise.all([
            this.prisma.conciliacaoExtratoItem.findMany({ where: { conciliacaoId }, orderBy: { ordem: 'asc' } }),
            this.categorias(empresaId),
            this.prisma.conciliacaoVinculo.findMany({ where: { empresaId } }),
            this.prisma.store.findMany({ where: { empresaId }, select: { id: true, cnpj: true, cpf: true } }),
        ]);
        const ids = new Set(categorias.map((c) => c.id));
        const validos = (k: string) => ids.has(k) || (FIXOS as readonly string[]).includes(k);
        const porNomeCat = new Map(categorias.map((c) => [c.nameNormalized, c.id]));
        const docsLojas = new Set(lojas.flatMap((l) => [so(l.cnpj), so(l.cpf)]).filter(Boolean));

        // Contas a pagar da loja perto do mês: pagas (pra não contar 2 vezes) e
        // em aberto (o Aplicar dá baixa).
        const [y, m] = conc.mes.split('-').map(Number);
        const ini = new Date(Date.UTC(y, m - 1, 1) - 20 * 86400000);
        const fim = new Date(Date.UTC(y, m, 1) + 10 * 86400000);
        const contas = await this.prisma.bill.findMany({
            where: {
                storeId: conc.storeId,
                OR: [
                    { conciliacaoExtratoId: conc.id },
                    { conciliacaoExtratoId: null, status: 'PAID', paidAt: { gte: ini, lt: fim } },
                    { conciliacaoExtratoId: null, status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { gte: ini, lt: fim } },
                ],
            },
            select: {
                id: true, description: true, value: true, status: true, paidAt: true, dueDate: true, beneficiary: true,
                categoryId: true, conciliacaoExtratoId: true, supplier: { select: { name: true } },
            },
        });
        const candidatas = contas.filter((c) => c.conciliacaoExtratoId !== conc.id);

        // Fornecedor → categoria mais recente usada nas contas da empresa.
        const historico = await this.prisma.bill.findMany({
            where: { store: { empresaId }, categoryId: { not: null }, supplierId: { not: null }, conciliacaoExtratoId: null },
            select: { categoryId: true, supplier: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 3000,
        });
        const catDoFornecedor = new Map<string, string>();
        for (const h of historico) {
            const nome = norm(h.supplier?.name ?? '').trim();
            if (nome && h.categoryId && !catDoFornecedor.has(nome)) catDoFornecedor.set(nome, h.categoryId);
        }

        const termosNome = vinculos.filter((v) => validos(v.destino)).map((v) => ({ termo: norm(v.termo).trim(), destino: v.destino }));
        const refazer = (i: { origem: string | null }) => i.origem !== 'MANUAL' && i.origem !== 'LINK';
        const usadas = new Set(itens.filter((i) => !refazer(i)).map((i) => i.billId).filter(Boolean) as string[]);

        let n = 0;
        const updates: Prisma.PrismaPromise<unknown>[] = [];
        for (const it of itens) {
            if (!refazer(it)) continue;
            const texto = norm(`${it.nome} ${it.descricao}`);
            const alvo = ` ${texto.replace(/[^A-Z0-9]+/g, ' ')} `;
            let partes: Parte[] = [];
            let motivo: string | null = null;
            let billId: string | null = null;
            let sugestao: string | null = null;

            // 1) Já está em Contas a Pagar (paga perto da data, ou em aberto
            //    vencendo perto). Mesmo valor; com mais de uma, só se o nome bater.
            const cands = candidatas.filter((c) => {
                if (usadas.has(c.id) || Math.abs(cent(Number(c.value)) - cent(it.valor)) > 1) return false;
                if (c.status === 'PAID') return !!c.paidAt && Math.abs(c.paidAt.getTime() - it.data.getTime()) <= 5 * 86400000;
                const d = (it.data.getTime() - c.dueDate.getTime()) / 86400000;
                return d >= -10 && d <= 15;
            });
            const nomesItem = palavrasNome(it.nome);
            const comNome = cands.filter((c) => {
                const t = norm(`${c.description} ${c.supplier?.name ?? ''} ${c.beneficiary ?? ''}`);
                const iguais = nomesItem.filter((w) => t.includes(w)).length;
                return iguais >= 2 || (nomesItem.length === 1 && iguais === 1);
            });
            const outrosMesmoValor = itens.filter((o) => o.id !== it.id && cent(o.valor) === cent(it.valor) && Math.abs(o.data.getTime() - it.data.getTime()) <= 5 * 86400000).length;
            const ref = (c: (typeof contas)[number]) => (c.status === 'PAID' ? c.paidAt! : c.dueDate).getTime();
            const conta = (comNome.length ? comNome : cands.length === 1 && outrosMesmoValor === 0 ? cands : [])
                .sort((a, b) => Math.abs(ref(a) - it.data.getTime()) - Math.abs(ref(b) - it.data.getTime()))[0];
            if (conta) {
                usadas.add(conta.id);
                billId = conta.id;
                partes = [{ k: conta.categoryId && ids.has(conta.categoryId) ? conta.categoryId : 'JA_LANCADO', v: it.valor }];
                motivo = conta.status === 'PAID'
                    ? `já está paga em Contas a Pagar: ${conta.description}`
                    : `conta em aberto em Contas a Pagar: ${conta.description} — o Aplicar dá baixa`;
            }

            // 2) Transferência pra outra conta da própria empresa.
            if (!partes.length && it.documento && docsLojas.has(so(it.documento))) {
                partes = [{ k: 'NAO', v: it.valor }];
                motivo = 'transferência entre contas da empresa';
            }

            // 3) Vínculo por nome.
            if (!partes.length && termosNome.length) {
                const hits = termosNome.filter((t) => alvo.includes(` ${t.termo.replace(/[^A-Z0-9]+/g, ' ').trim()} `));
                const dest = [...new Set(hits.map((h) => h.destino))];
                if (dest.length === 1) {
                    partes = [{ k: dest[0], v: it.valor }];
                    motivo = `vínculo ${hits.map((h) => h.termo).join('/')}`;
                } else if (dest.length > 1) sugestao = dest[0];
            }

            // 4) Fornecedor que já tem categoria nas contas.
            if (!partes.length && catDoFornecedor.size) {
                for (const [nome, cat] of catDoFornecedor) {
                    const ws = palavrasNome(nome);
                    if (!ws.length || !ids.has(cat)) continue;
                    const iguais = ws.filter((w) => alvo.includes(` ${w} `)).length;
                    if (iguais >= Math.min(2, ws.length)) {
                        partes = [{ k: cat, v: it.valor }];
                        motivo = `fornecedor ${nome}`;
                        break;
                    }
                }
            }

            // 5) Palavras conhecidas (CEMIG, COPASA, DAS, tarifa...).
            if (!partes.length) {
                const regra = REGRAS.find((r) => r.re.test(texto) || (r.categoria === 'tarifas bancarias' && it.tipo === 'TARIFA'));
                const destino = regra ? (regra.categoria === 'NAO' ? 'NAO' : porNomeCat.get(normalizeCategoryName(regra.categoria))) : undefined;
                if (destino) {
                    partes = [{ k: destino, v: it.valor }];
                    motivo = regra!.categoria === 'NAO' ? 'aplicação/transferência' : `palavra no extrato (${regra!.categoria})`;
                }
            }

            if (partes.length) n++;
            if (partes.length || (it.partes as Parte[] | null)?.length || billId !== it.billId || sugestao !== it.sugestao || motivo !== it.motivo) {
                updates.push(this.prisma.conciliacaoExtratoItem.update({
                    where: { id: it.id },
                    data: { partes: partes as unknown as Prisma.InputJsonValue, origem: partes.length ? 'AUTO' : null, motivo, billId, sugestao },
                }));
            }
        }
        if (updates.length) await this.prisma.$transaction(updates);
        return n;
    }

    // ------------------------------------------------------------ tela interna
    async listar(user: any, storeId?: string) {
        const empresaId = empresaDo(user);
        const permitidas = await lojasPermitidas(this.prisma, user);
        const lista = await this.prisma.conciliacaoExtrato.findMany({
            where: {
                empresaId,
                ...(storeId ? { storeId } : permitidas ? { storeId: { in: permitidas } } : {}),
            },
            orderBy: [{ mes: 'desc' }, { createdAt: 'desc' }],
            select: { id: true, storeId: true, mes: true, banco: true, arquivos: true, totalPagamentos: true, nPagamentos: true, status: true, pendenteReaplicar: true, aplicadoEm: true, linkEnviadoEm: true, linkEnviadoPor: true, createdAt: true, itens: { select: { partes: true, valor: true } } },
        });
        const lojas = await this.prisma.store.findMany({ where: { empresaId }, select: { id: true, name: true } });
        return lista.map(({ itens, ...c }) => {
            const pend = itens.filter((i) => !(i.partes as Parte[] | null)?.length);
            return {
                ...c,
                lojaNome: lojas.find((l) => l.id === c.storeId)?.name ?? null,
                pendentes: pend.length,
                valorPendente: Math.round(pend.reduce((s, i) => s + i.valor, 0) * 100) / 100,
            };
        });
    }

    async obter(user: any, id: string) {
        await this.daEmpresa(user, id);
        const c = await this.prisma.conciliacaoExtrato.findUniqueOrThrow({ where: { id }, include: { itens: { orderBy: { ordem: 'asc' } } } });
        const [categorias, vinculos, lancados, loja] = await Promise.all([
            this.categorias(c.empresaId),
            this.prisma.conciliacaoVinculo.findMany({ where: { empresaId: c.empresaId }, orderBy: { termo: 'asc' } }),
            this.prisma.bill.aggregate({ where: { conciliacaoExtratoId: id }, _count: true, _sum: { value: true } }),
            this.prisma.store.findUnique({ where: { id: c.storeId }, select: { name: true } }),
        ]);
        const baixas = c.itens.filter((i) => i.baixaFeita).length;
        return {
            ...c,
            lojaNome: loja?.name ?? null,
            categorias: categorias.map(({ nameNormalized: _n, ...r }) => r),
            vinculos,
            lancados: { quantidade: lancados._count, total: Number(lancados._sum.value ?? 0), baixas },
        };
    }

    // Valida e grava a classificação de vários itens (tela ou link).
    async salvarItens(conciliacaoId: string, empresaId: string, itensBody: { id: string; partes?: Parte[]; nota?: string | null; desvincular?: boolean }[], origem: 'MANUAL' | 'LINK') {
        if (!Array.isArray(itensBody)) throw new BadRequestException('Nada pra salvar.');
        const [atuais, categorias] = await Promise.all([
            this.prisma.conciliacaoExtratoItem.findMany({ where: { conciliacaoId } }),
            this.categorias(empresaId),
        ]);
        const porId = new Map(atuais.map((i) => [i.id, i]));
        const ids = new Set(categorias.map((c) => c.id));
        const updates: Prisma.PrismaPromise<unknown>[] = [];
        for (const b of itensBody.slice(0, 5000)) {
            const it = porId.get(b?.id);
            if (!it) continue;
            const data: Prisma.ConciliacaoExtratoItemUpdateInput = {};
            if (b.partes !== undefined) {
                const partes = (Array.isArray(b.partes) ? b.partes : [])
                    .map((p) => ({ k: String(p?.k ?? ''), v: Math.round(Number(p?.v) * 100) / 100 }))
                    .filter((p) => p.v > 0);
                for (const p of partes) {
                    if (!ids.has(p.k) && !(FIXOS as readonly string[]).includes(p.k)) throw new BadRequestException(`Categoria inválida no pagamento ${it.ordem}.`);
                }
                if (new Set(partes.map((p) => p.k)).size !== partes.length) throw new BadRequestException(`Categoria repetida no pagamento ${it.ordem}.`);
                if (partes.length && Math.abs(cent(partes.reduce((s, p) => s + p.v, 0)) - cent(it.valor)) > 1) {
                    throw new BadRequestException(`Pagamento ${it.ordem} (${it.nome}): a soma das partes não bate com o valor.`);
                }
                if (JSON.stringify(it.partes ?? []) !== JSON.stringify(partes)) {
                    data.partes = partes as unknown as Prisma.InputJsonValue;
                    data.origem = partes.length ? origem : null;
                    data.motivo = null;
                }
            }
            if (b.nota !== undefined && (b.nota ?? '') !== (it.nota ?? '')) data.nota = (b.nota ?? '').slice(0, 300) || null;
            if (b.desvincular === true && it.billId) { data.billId = null; if (data.motivo === undefined) data.motivo = null; }
            if (Object.keys(data).length) updates.push(this.prisma.conciliacaoExtratoItem.update({ where: { id: it.id }, data }));
        }
        if (updates.length) {
            await this.prisma.$transaction(updates);
            await this.prisma.conciliacaoExtrato.updateMany({ where: { id: conciliacaoId, status: 'APLICADA' }, data: { pendenteReaplicar: true } });
        }
        return { alterados: updates.length };
    }

    async salvarInterno(user: any, id: string, itens: any[]) {
        const c = await this.daEmpresa(user, id);
        return this.salvarItens(id, c.empresaId, itens, 'MANUAL');
    }

    async reclassificar(user: any, id: string) {
        await this.daEmpresa(user, id);
        return { classificados: await this.classificarAuto(id) };
    }

    async gerarLink(user: any, id: string) {
        await this.daEmpresa(user, id);
        const token = randomBytes(24).toString('hex');
        await this.prisma.conciliacaoExtrato.update({ where: { id }, data: { token } });
        return { token };
    }

    async revogarLink(user: any, id: string) {
        await this.daEmpresa(user, id);
        await this.prisma.conciliacaoExtrato.update({ where: { id }, data: { token: null } });
        return { token: null };
    }

    // Tira o que um "Aplicar" anterior fez: apaga as contas criadas e volta
    // pra aberta as que tinham levado baixa.
    private async desfazerInterno(id: string) {
        const itens = await this.prisma.conciliacaoExtratoItem.findMany({ where: { conciliacaoId: id, baixaFeita: true, billId: { not: null } }, select: { id: true, billId: true } });
        const hoje = new Date();
        hoje.setUTCHours(0, 0, 0, 0);
        for (const it of itens) {
            const b = await this.prisma.bill.findUnique({ where: { id: it.billId! }, select: { dueDate: true, status: true } });
            if (b && b.status === 'PAID') {
                await this.prisma.bill.update({
                    where: { id: it.billId! },
                    data: { status: b.dueDate < hoje ? BillStatus.OVERDUE : BillStatus.OPEN, paidAt: null },
                });
            }
        }
        const [r] = await this.prisma.$transaction([
            this.prisma.bill.deleteMany({ where: { conciliacaoExtratoId: id } }),
            this.prisma.conciliacaoExtratoItem.updateMany({ where: { conciliacaoId: id }, data: { baixaFeita: false } }),
        ]);
        return { removidas: r.count, reabertas: itens.length };
    }

    // "OK": dá baixa nas contas que já existiam e cria (já pagas) as que
    // faltam, cada uma na categoria escolhida.
    async aplicar(user: any, id: string) {
        const c = await this.daEmpresa(user, id);
        await this.desfazerInterno(id);
        const itens = await this.prisma.conciliacaoExtratoItem.findMany({ where: { conciliacaoId: id }, orderBy: { ordem: 'asc' } });
        const categorias = new Set((await this.categorias(c.empresaId)).map((x) => x.id));
        const [y, m] = c.mes.split('-');
        let criadas = 0, baixas = 0, total = 0;

        for (const it of itens) {
            const partes = ((it.partes as Parte[] | null) ?? []).filter((p) => p.v > 0);
            if (!partes.length) continue;
            if (it.billId) {
                const b = await this.prisma.bill.findUnique({ where: { id: it.billId }, select: { id: true, status: true, categoryId: true, notes: true, storeId: true } });
                if (!b || b.storeId !== c.storeId) continue;
                const cat = partes.length === 1 && categorias.has(partes[0].k) ? partes[0].k : null;
                if (b.status === 'OPEN' || b.status === 'OVERDUE') {
                    await this.prisma.bill.update({
                        where: { id: b.id },
                        data: {
                            status: BillStatus.PAID,
                            paidAt: it.data,
                            queuedForPaymentAt: null,
                            ...(cat && !b.categoryId ? { categoryId: cat } : {}),
                            notes: [b.notes, `Baixa pela Conciliação do Extrato ${m}/${y}.`].filter(Boolean).join('\n'),
                        },
                    });
                    await this.prisma.conciliacaoExtratoItem.update({ where: { id: it.id }, data: { baixaFeita: true } });
                    baixas++;
                } else if (cat && !b.categoryId) {
                    await this.prisma.bill.update({ where: { id: b.id }, data: { categoryId: cat } });
                }
                continue;
            }
            const forma = formaDoTipo(it.tipo);
            for (const p of partes) {
                if (!categorias.has(p.k)) continue; // NAO / JA_LANCADO não viram conta
                const dividido = partes.length > 1 ? ` (parte de ${it.valor.toFixed(2).replace('.', ',')})` : '';
                await this.prisma.bill.create({
                    data: {
                        description: `${descricaoConta(it.nome, it.descricao)}${dividido}`.slice(0, 250),
                        value: new Prisma.Decimal(p.v.toFixed(2)),
                        type: forma.type,
                        paymentMethod: forma.paymentMethod,
                        dueDate: it.data,
                        paidAt: it.data,
                        status: BillStatus.PAID,
                        storeId: c.storeId,
                        categoryId: p.k,
                        launchedById: user.id,
                        conciliacaoExtratoId: id,
                        notes: [`Criada pela Conciliação do Extrato ${m}/${y}.`, it.nota].filter(Boolean).join('\n'),
                    },
                });
                criadas++;
                total += p.v;
            }
        }
        await this.prisma.conciliacaoExtrato.update({ where: { id }, data: { status: 'APLICADA', aplicadoEm: new Date(), aplicadoPor: nomeDo(user), pendenteReaplicar: false } });
        return { criadas, baixas, total: Math.round(total * 100) / 100 };
    }

    async desfazer(user: any, id: string) {
        await this.daEmpresa(user, id);
        const r = await this.desfazerInterno(id);
        await this.prisma.conciliacaoExtrato.update({ where: { id }, data: { status: 'ABERTA', aplicadoEm: null, aplicadoPor: null, pendenteReaplicar: false } });
        return r;
    }

    async excluir(user: any, id: string) {
        await this.daEmpresa(user, id);
        await this.desfazerInterno(id);
        await this.prisma.conciliacaoExtrato.delete({ where: { id } });
        return { ok: true };
    }

    // ---------------------------------------------------------------- vínculos
    listarVinculos(user: any) {
        return this.prisma.conciliacaoVinculo.findMany({ where: { empresaId: empresaDo(user) }, orderBy: { termo: 'asc' } });
    }

    async salvarVinculo(user: any, body: { termo?: string; destino?: string }) {
        const empresaId = empresaDo(user);
        const termo = norm(body?.termo ?? '').replace(/\s+/g, ' ').trim();
        const destino = String(body?.destino ?? '');
        if (termo.length < 3) throw new BadRequestException('Termo muito curto (mínimo 3 letras).');
        const ok = destino === 'NAO' || !!(await this.prisma.billCategory.findFirst({ where: { id: destino, empresaId }, select: { id: true } }));
        if (!ok) throw new BadRequestException('Escolha a categoria.');
        return this.prisma.conciliacaoVinculo.upsert({
            where: { empresaId_termo: { empresaId, termo } },
            create: { empresaId, termo, destino },
            update: { destino },
        });
    }

    // Vários de uma vez, um por linha: "CEMIG → Luz", "JOAO SILVA = Freelancer".
    async salvarVinculosLote(user: any, texto: string) {
        const empresaId = empresaDo(user);
        const categorias = await this.categorias(empresaId);
        const destinoDe = (bruto: string): string | null => {
            const d = normalizeCategoryName(bruto);
            if (/^nao|^não/.test(d) || d === 'transferencia') return 'NAO';
            const exata = categorias.find((c) => c.nameNormalized === d);
            if (exata) return exata.id;
            const parecidas = categorias.filter((c) => c.nameNormalized.startsWith(d) || c.nameNormalized.includes(d));
            return parecidas.length === 1 ? parecidas[0].id : null;
        };
        let salvos = 0;
        const erros: string[] = [];
        for (const linhaBruta of String(texto ?? '').split(/\r?\n/).slice(0, 500)) {
            const linha = linhaBruta.trim();
            if (!linha || linha.startsWith('#')) continue;
            const m = /^(.+?)\s*(?:→|->|=>|=|;|\t)\s*(.+)$/.exec(linha);
            if (!m) { erros.push(`"${linha}": use TERMO → CATEGORIA`); continue; }
            const destino = destinoDe(m[2]);
            if (!destino) { erros.push(`"${linha}": categoria "${m[2].trim()}" não encontrada`); continue; }
            try {
                await this.salvarVinculo(user, { termo: m[1], destino });
                salvos++;
            } catch (e: any) {
                erros.push(`"${linha}": ${e?.message ?? 'erro'}`);
            }
        }
        return { salvos, erros };
    }

    async excluirVinculo(user: any, id: string) {
        await this.prisma.conciliacaoVinculo.deleteMany({ where: { id, empresaId: empresaDo(user) } });
        return { ok: true };
    }

    // ------------------------------------------------------------- link público
    private async doToken(token: string, contar = false) {
        if (!token || token.length < 20) throw new NotFoundException('Link inválido.');
        const c = await this.prisma.conciliacaoExtrato.findUnique({ where: { token } });
        if (!c) throw new NotFoundException('Link inválido ou desativado.');
        const empresa = await this.prisma.empresa.findUnique({ where: { id: c.empresaId }, select: { name: true, active: true } });
        if (!empresa?.active) throw new NotFoundException('Link inválido ou desativado.');
        if (contar) this.limite.contar(token);
        return { c, empresa };
    }

    async obterPublico(token: string) {
        const { c, empresa } = await this.doToken(token);
        const [itens, categorias, loja] = await Promise.all([
            this.prisma.conciliacaoExtratoItem.findMany({
                where: { conciliacaoId: c.id },
                orderBy: { ordem: 'asc' },
                select: { id: true, ordem: true, data: true, hora: true, tipo: true, nome: true, descricao: true, valor: true, partes: true, origem: true, motivo: true, sugestao: true, nota: true, billId: true },
            }),
            this.categorias(c.empresaId),
            this.prisma.store.findUnique({ where: { id: c.storeId }, select: { name: true } }),
        ]);
        return {
            empresa: empresa.name, loja: loja?.name ?? null, mes: c.mes, banco: c.banco,
            totalPagamentos: c.totalPagamentos, nPagamentos: c.nPagamentos, totalRecebimentos: c.totalRecebimentos,
            saldoAnterior: c.saldoAnterior, saldoFinal: c.saldoFinal,
            linkEnviadoEm: c.linkEnviadoEm, linkEnviadoPor: c.linkEnviadoPor,
            categorias: categorias.map(({ nameNormalized: _n, ...r }) => r),
            itens,
        };
    }

    async salvarPublico(token: string, body: { nome?: string; itens?: any[] }) {
        const { c } = await this.doToken(token, true);
        const r = await this.salvarItens(c.id, c.empresaId, body?.itens ?? [], 'LINK');
        await this.prisma.conciliacaoExtrato.update({
            where: { id: c.id },
            data: { linkEnviadoEm: new Date(), linkEnviadoPor: (body?.nome ?? '').trim().slice(0, 80) || 'Link' },
        });
        return { ok: true, ...r };
    }
}
