import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BillPaymentMethod, PayableType } from '@prisma/client';
import { randomBytes } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { BillsService } from '../bills/bills.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { vencimentoUtil } from '../common/dias-uteis';
import { lerDocumentoComIa } from './documento-ia';
import { DocumentoLido, documentoVazio, lerTextoDocumento, lerXmlDocumento } from './documento-parser';
import { LimiteEnvios, empresaDo, filtroLoja, lerPdf, lojaDoDocumento, lojasPermitidas, lojaValida, nomeDo, salvarArquivoConta, so } from './entrada.util';

// =============================================================================
// Lançar Contas: boleto ou nota chega (pela tela, pelo link da loja, pelo
// WhatsApp ou pelo e-mail), o sistema lê o documento e acha a loja pelo CNPJ.
// Fica PENDENTE até o financeiro conferir e lançar — aí vira conta(s) a pagar.
// =============================================================================

type ParcelaEntrada = { valor: number | string; vencimento: string; codigoBarras?: string };

const SEM_ARQUIVO = {
    id: true, empresaId: true, storeId: true, lojaPor: true, arquivoNome: true, arquivoMime: true, tipoDocumento: true,
    fornecedor: true, fornecedorDoc: true, valor: true, vencimento: true, emissao: true, numeroDocumento: true,
    codigoBarras: true, chaveNfe: true, descricao: true, parcelas: true, categoryId: true, observacaoEnvio: true,
    enviadoPorNome: true, origem: true, status: true, billIds: true, lancadoEm: true, lancadoPor: true,
    motivoDescarte: true, createdAt: true,
    tipoConta: true, formaPagamento: true, nfEntradaId: true, nfServicoId: true, observacaoConferencia: true,
} as const;
const dataISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const meioDia = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00.000Z`) : null);

const TIPOS: PayableType[] = ['BOLETO', 'PIX', 'CARD', 'NO_BILL'];

// Resumo de uma NF do sistema (de entrada / de serviço) para atrelar à conta.
export type NfResumo = {
    tipo: 'PRODUTO' | 'SERVICO';
    id: string;
    chave: string;
    numero: string | null;
    emitente: string | null;
    emitenteDoc: string | null;
    valor: number | null;
    emissao: string | null;
    storeId: string;
    loja: string | null;
    billId: string | null;
    purchaseId: string | null;
};
const NF_GOODS_SELECT = { id: true, chaveAcesso: true, issuerName: true, issuerCnpj: true, value: true, issueDate: true, storeId: true, billId: true, purchaseId: true } as const;
const NF_SERVICE_SELECT = { id: true, chaveAcesso: true, numeroNf: true, issuerName: true, issuerDoc: true, value: true, issueDate: true, storeId: true, billId: true } as const;
const nomeLoja = (lojas: { id: string; name: string }[], id: string) => lojas.find((l) => l.id === id)?.name ?? null;
function resumoGoods(n: any, lojas: { id: string; name: string }[]): NfResumo {
    const chave = String(n.chaveAcesso ?? '');
    return {
        tipo: 'PRODUTO', id: n.id, chave,
        numero: /^\d{44}$/.test(chave) ? String(Number(chave.slice(25, 34))) : null,
        emitente: n.issuerName ?? null, emitenteDoc: n.issuerCnpj ? so(n.issuerCnpj) : null,
        valor: n.value != null ? Number(n.value) : null, emissao: dataISO(n.issueDate),
        storeId: n.storeId, loja: nomeLoja(lojas, n.storeId), billId: n.billId ?? null, purchaseId: n.purchaseId ?? null,
    };
}
function resumoService(n: any, lojas: { id: string; name: string }[]): NfResumo {
    return {
        tipo: 'SERVICO', id: n.id, chave: String(n.chaveAcesso ?? ''),
        numero: n.numeroNf ?? null,
        emitente: n.issuerName ?? null, emitenteDoc: n.issuerDoc ? so(n.issuerDoc) : null,
        valor: n.value != null ? Number(n.value) : null, emissao: dataISO(n.issueDate),
        storeId: n.storeId, loja: nomeLoja(lojas, n.storeId), billId: n.billId ?? null, purchaseId: null,
    };
}
const FORMAS: BillPaymentMethod[] = ['BANK_SLIP', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'FLASH', 'BANK_TRANSFER', 'COMPANY_ACCOUNT'];

export type ArquivoEntrada = { buffer: Buffer; originalname: string; mimetype: string };

@Injectable()
export class ContasEnviadasService {
    private limite = new LimiteEnvios(60);
    private readonly logger = new Logger(ContasEnviadasService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly bills: BillsService,
        private readonly suppliers: SuppliersService,
    ) { }

    async lerDocumento(file: ArquivoEntrada): Promise<DocumentoLido> {
        return (await this.lerDocumentos(file))[0] ?? documentoVazio();
    }

    // Um arquivo pode ter várias contas (PDF escaneado com vários boletos /
    // notas). PDF com texto e XML: leitura direta. Foto e PDF escaneado (sem
    // texto): IA (precisa de OPENAI_API_KEY), que separa as contas e acha o
    // CNPJ do pagador / destinatário.
    async lerDocumentos(file: ArquivoEntrada): Promise<DocumentoLido[]> {
        const nome = (file.originalname || '').toLowerCase();
        const ehPdf = file.mimetype === 'application/pdf' || nome.endsWith('.pdf');
        const ehImagem = /^image\//.test(file.mimetype || '') || /\.(jpe?g|png|webp|heic)$/.test(nome);
        try {
            if (/xml/.test(file.mimetype) || nome.endsWith('.xml')) {
                return [lerXmlDocumento(file.buffer.toString('utf8').replace(/^\uFEFF/, ''))];
            }
            if (ehPdf) {
                const texto = await lerPdf(file.buffer);
                if (texto.replace(/\s/g, '').length >= 80) return [lerTextoDocumento(texto)];
            }
        } catch {
            // segue para a IA / vazio
        }
        if (ehPdf || ehImagem) {
            try {
                const lidos = (await lerDocumentoComIa(file))?.filter((l) => l.tipoDocumento !== 'COMPROVANTE');
                if (lidos?.length) return lidos;
            } catch (e: any) {
                this.logger.warn(`Leitura por IA de "${file.originalname}" falhou: ${e?.message ?? e}`);
            }
        }
        return [documentoVazio()];
    }

    // Núcleo: grava o envio. storePadrao = loja do link; lojasCanal = lojas
    // atendidas pelo WhatsApp/e-mail (se for uma só, é ela).
    async registrar(
        empresaId: string,
        file: ArquivoEntrada | undefined,
        opcoes: {
            enviadoPor?: string | null;
            origem: 'TELA' | 'LINK' | 'WHATSAPP' | 'EMAIL';
            storePadrao?: string | null;
            lojasCanal?: string[];
            categoryId?: string | null;
            observacao?: string | null;
            lido?: DocumentoLido;
            // Já lidos antes (o recebimento automático usa a IA pra decidir
            // se é boleto/nota ou comprovante e reaproveita a leitura).
            lidos?: DocumentoLido[];
        },
    ) {
        if (!file) throw new BadRequestException('Anexe o boleto ou a nota (PDF, XML ou foto).');
        const lidos = opcoes.lido ? [opcoes.lido] : opcoes.lidos?.length ? opcoes.lidos : await this.lerDocumentos(file);
        const criadas: Awaited<ReturnType<ContasEnviadasService['registrarUm']>>[] = [];
        let erro: unknown = null;
        for (const lido of lidos) {
            try {
                criadas.push(await this.registrarUm(empresaId, file, lido, opcoes));
            } catch (e) {
                // Num arquivo com várias contas, uma repetida não impede as outras.
                if (lidos.length === 1) throw e;
                erro ??= e;
            }
        }
        if (!criadas.length) throw erro;
        return { ...criadas[0], total: criadas.length, ignoradas: lidos.length - criadas.length, contas: criadas };
    }

    private async registrarUm(
        empresaId: string,
        file: ArquivoEntrada,
        lido: DocumentoLido,
        opcoes: {
            enviadoPor?: string | null;
            origem: 'TELA' | 'LINK' | 'WHATSAPP' | 'EMAIL';
            storePadrao?: string | null;
            lojasCanal?: string[];
            categoryId?: string | null;
            observacao?: string | null;
        },
    ) {
        if (lido.codigoBarras || lido.chaveNfe) {
            const repetido = await this.prisma.contaEnviada.findFirst({
                where: {
                    empresaId,
                    status: { not: 'DESCARTADA' },
                    OR: [
                        ...(lido.codigoBarras ? [{ codigoBarras: lido.codigoBarras }] : []),
                        ...(lido.chaveNfe ? [{ chaveNfe: lido.chaveNfe }] : []),
                    ],
                },
                select: { status: true },
            });
            if (repetido) {
                throw new BadRequestException(repetido.status === 'LANCADA'
                    ? 'Este documento já foi enviado e lançado em Contas a Pagar.'
                    : 'Este documento já foi enviado e está aguardando conferência.');
            }
        }

        const loja = await lojaDoDocumento(this.prisma, empresaId, lido.documentos, {
            excluir: lido.fornecedorDoc,
            padrao: opcoes.storePadrao,
            permitidas: opcoes.lojasCanal,
        });
        const categoria = opcoes.categoryId
            ? await this.prisma.billCategory.findFirst({ where: { id: opcoes.categoryId, empresaId }, select: { id: true } })
            : null;

        // A nota já está no sistema (NF de entrada buscada na SEFAZ)? Já
        // deixa atrelada — e, se a loja não saiu pelo CNPJ, usa a loja da NF.
        const nf = lido.chaveNfe
            ? await this.prisma.incomingGoodsNf.findFirst({
                where: { chaveAcesso: lido.chaveNfe, store: { empresaId } },
                select: { id: true, storeId: true },
            })
            : null;
        if (nf && (!loja.storeId || loja.lojaPor !== 'CNPJ')) {
            loja.storeId = nf.storeId;
            loja.lojaPor = 'NF';
        }

        return this.prisma.contaEnviada.create({
            data: {
                empresaId,
                storeId: loja.storeId,
                lojaPor: loja.lojaPor,
                nfEntradaId: nf?.id ?? null,
                arquivo: new Uint8Array(file.buffer),
                arquivoNome: file.originalname,
                arquivoMime: file.mimetype,
                tipoDocumento: lido.tipoDocumento,
                fornecedor: lido.fornecedor,
                fornecedorDoc: lido.fornecedorDoc,
                valor: lido.valor,
                vencimento: meioDia(lido.vencimento),
                emissao: meioDia(lido.emissao),
                numeroDocumento: lido.numeroDocumento,
                codigoBarras: lido.codigoBarras,
                chaveNfe: lido.chaveNfe,
                descricao: lido.descricao,
                parcelas: lido.parcelas.length ? (lido.parcelas as any) : undefined,
                categoryId: categoria?.id ?? null,
                observacaoEnvio: opcoes.observacao?.trim() || null,
                enviadoPorNome: opcoes.enviadoPor ?? null,
                origem: opcoes.origem,
            },
            select: { id: true, fornecedor: true, valor: true, vencimento: true, tipoDocumento: true, storeId: true },
        });
    }

    // Pela tela (usuário logado).
    async criar(user: any, body: { storeId?: string; categoryId?: string; observacao?: string }, file?: ArquivoEntrada) {
        const empresaId = empresaDo(user);
        const storePadrao = await lojaValida(this.prisma, user, empresaId, body.storeId);
        return this.registrar(empresaId, file, {
            enviadoPor: nomeDo(user),
            origem: 'TELA',
            storePadrao,
            categoryId: body.categoryId,
            observacao: body.observacao,
        });
    }

    // Recebimento automático: a entrada que tinha virado comprovante passa a
    // apontar pra conta enviada (a lista "Últimos recebidos" fica certa).
    async ajustarEntradaMovida(pagamentoId: string, contaId: string) {
        await this.prisma.entradaAutomatica.updateMany({
            where: { destinoTipo: 'PAGAMENTO_AVISADO', destinoId: pagamentoId },
            data: { tipo: 'BOLETO_NOTA', destinoTipo: 'CONTA_ENVIADA', destinoId: contaId, destinoIds: [contaId], mensagem: 'Movido para Lançar contas.' },
        }).catch(() => null);
    }

    // ---------- Link secreto (um por loja) ----------

    async obterLink(user: any, storeId: string) {
        const empresaId = empresaDo(user);
        await lojaValida(this.prisma, user, empresaId, storeId);
        const s = await this.prisma.store.findUnique({ where: { id: storeId }, select: { tokenEnvioContas: true } });
        return { token: s?.tokenEnvioContas ?? null };
    }

    async gerarLink(user: any, storeId: string) {
        const empresaId = empresaDo(user);
        await lojaValida(this.prisma, user, empresaId, storeId);
        const token = randomBytes(24).toString('hex');
        await this.prisma.store.update({ where: { id: storeId }, data: { tokenEnvioContas: token } });
        return { token };
    }

    async revogarLink(user: any, storeId: string) {
        const empresaId = empresaDo(user);
        await lojaValida(this.prisma, user, empresaId, storeId);
        await this.prisma.store.update({ where: { id: storeId }, data: { tokenEnvioContas: null } });
        return { token: null };
    }

    async lojaDoToken(token: string, contar = false) {
        if (!token || token.length < 20) throw new NotFoundException('Link inválido.');
        const loja = await this.prisma.store.findUnique({
            where: { tokenEnvioContas: token },
            select: { id: true, name: true, active: true, empresaId: true, empresa: { select: { active: true } } },
        });
        if (!loja || !loja.active || !loja.empresa.active) throw new NotFoundException('Link inválido ou desativado.');
        if (contar) this.limite.contar(token);
        return loja;
    }

    async opcoesPublicas(empresaId: string) {
        const categorias = await this.prisma.billCategory.findMany({
            where: { empresaId, active: true },
            select: { id: true, name: true, group: true },
            orderBy: { name: 'asc' },
        });
        return { categorias };
    }

    // ---------- Tela do financeiro ----------

    async listar(user: any, status?: string, storeId?: string) {
        const empresaId = empresaDo(user);
        const st = status === 'LANCADA' || status === 'DESCARTADA' ? status : 'PENDENTE';
        const itens = await this.prisma.contaEnviada.findMany({
            where: { empresaId, status: st, ...(await filtroLoja(this.prisma, user, storeId)) },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: SEM_ARQUIVO,
        });
        const [lojas, categorias] = await Promise.all([
            this.prisma.store.findMany({ where: { empresaId }, select: { id: true, name: true } }),
            this.prisma.billCategory.findMany({ where: { empresaId }, select: { id: true, name: true } }),
        ]);
        const nfs = await this.resumoNfs(
            itens.map((i) => i.nfEntradaId).filter(Boolean) as string[],
            itens.map((i) => i.nfServicoId).filter(Boolean) as string[],
            lojas,
        );
        return itens.map((i) => ({
            ...i,
            vencimento: dataISO(i.vencimento),
            emissao: dataISO(i.emissao),
            temArquivo: !!i.arquivoNome,
            lojaNome: lojas.find((l) => l.id === i.storeId)?.name ?? null,
            categoriaNome: categorias.find((c) => c.id === i.categoryId)?.name ?? null,
            nf: (i.nfEntradaId && nfs.get(i.nfEntradaId)) || (i.nfServicoId && nfs.get(i.nfServicoId)) || null,
        }));
    }

    // ---------- NF já no sistema (NF de entrada / NFS-e buscadas) ----------

    private async resumoNfs(goodsIds: string[], serviceIds: string[], lojas?: { id: string; name: string }[]) {
        const mapa = new Map<string, NfResumo>();
        if (!goodsIds.length && !serviceIds.length) return mapa;
        const [goods, services] = await Promise.all([
            goodsIds.length ? this.prisma.incomingGoodsNf.findMany({ where: { id: { in: goodsIds } }, select: NF_GOODS_SELECT }) : [],
            serviceIds.length ? this.prisma.incomingServiceNf.findMany({ where: { id: { in: serviceIds } }, select: NF_SERVICE_SELECT }) : [],
        ]);
        const nomes = lojas ?? await this.prisma.store.findMany({ where: { id: { in: [...goods, ...services].map((n) => n.storeId) } }, select: { id: true, name: true } });
        for (const n of goods) mapa.set(n.id, resumoGoods(n, nomes));
        for (const n of services) mapa.set(n.id, resumoService(n, nomes));
        return mapa;
    }

    // NFs do sistema que podem ser deste documento: mesma chave, mesmo
    // fornecedor (CNPJ), mesmo valor — ou o que a pessoa buscar.
    async nfsCandidatas(user: any, id: string, busca?: string) {
        const item = await this.doUsuario(user, id);
        const permitidas = await lojasPermitidas(this.prisma, user);
        const lojas = await this.prisma.store.findMany({
            where: { empresaId: item.empresaId, ...(permitidas ? { id: { in: permitidas } } : {}) },
            select: { id: true, name: true },
        });
        const storeIds = lojas.map((l) => l.id);
        const q = String(busca ?? '').trim();
        const qDig = so(q);
        const qValor = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(q) ? Number(q.replace(/\./g, '').replace(',', '.')) : null;

        // Número da NF lido do documento ("001974997-001" / "NF:1974997-1" → "1974997").
        const numeroNf = (() => {
            const m = /(\d{1,9})/.exec(String(item.numeroDocumento ?? '').replace(/^\D*/, ''));
            return m && Number(m[1]) > 0 ? String(Number(m[1])) : null;
        })();
        const goodsOr: any[] = [];
        const servOr: any[] = [];
        if (q) {
            goodsOr.push({ issuerName: { contains: q, mode: 'insensitive' } });
            servOr.push({ issuerName: { contains: q, mode: 'insensitive' } });
            if (qDig.length >= 3) {
                goodsOr.push({ chaveAcesso: { contains: qDig } }, { issuerCnpj: { contains: qDig } });
                servOr.push({ numeroNf: { contains: qDig } }, { issuerDoc: { contains: qDig } }, { chaveAcesso: { contains: qDig } });
            }
            if (qValor) {
                goodsOr.push({ value: { gte: qValor - 0.01, lte: qValor + 0.01 } });
                servOr.push({ value: { gte: qValor - 0.01, lte: qValor + 0.01 } });
            }
        } else {
            if (numeroNf) {
                goodsOr.push({ chaveAcesso: { contains: numeroNf.padStart(9, '0') } });
                servOr.push({ numeroNf: { contains: numeroNf } });
            }
            if (item.chaveNfe) { goodsOr.push({ chaveAcesso: item.chaveNfe }); servOr.push({ chaveAcesso: item.chaveNfe }); }
            if (item.fornecedorDoc) { goodsOr.push({ issuerCnpj: item.fornecedorDoc }); servOr.push({ issuerDoc: item.fornecedorDoc }); }
            if (item.valor && item.valor > 0) {
                goodsOr.push({ value: { gte: item.valor - 0.05, lte: item.valor + 0.05 } });
                servOr.push({ value: { gte: item.valor - 0.05, lte: item.valor + 0.05 } });
            }
            if (item.fornecedor) {
                const palavra = item.fornecedor.split(/\s+/).find((p) => p.length >= 4);
                if (palavra) {
                    goodsOr.push({ issuerName: { contains: palavra, mode: 'insensitive' } });
                    servOr.push({ issuerName: { contains: palavra, mode: 'insensitive' } });
                }
            }
        }
        const base = { storeId: { in: storeIds }, ignored: false, tipoDocumento: { notIn: ['resEvento', 'procEventoNFe'] } };
        const [goods, services] = await Promise.all([
            this.prisma.incomingGoodsNf.findMany({
                where: goodsOr.length ? { ...base, OR: goodsOr } : { ...base, storeId: item.storeId ?? { in: storeIds } },
                select: NF_GOODS_SELECT, orderBy: { issueDate: 'desc' }, take: 60,
            }),
            this.prisma.incomingServiceNf.findMany({
                where: servOr.length ? { ...base, OR: servOr } : { ...base, storeId: item.storeId ?? { in: storeIds } },
                select: NF_SERVICE_SELECT, orderBy: { issueDate: 'desc' }, take: 30,
            }),
        ]);
        const ref = (item.emissao ?? item.vencimento ?? item.createdAt).getTime();
        const lista = [...goods.map((n) => resumoGoods(n, lojas)), ...services.map((n) => resumoService(n, lojas))].map((n) => {
            const motivos: string[] = [];
            let score = 0;
            if (item.chaveNfe && n.chave === item.chaveNfe) { score += 100; motivos.push('mesma chave'); }
            if (item.fornecedorDoc && n.emitenteDoc === item.fornecedorDoc) { score += 40; motivos.push('mesmo fornecedor'); }
            if (numeroNf && n.numero && String(Number(n.numero)) === numeroNf) { score += 40; motivos.push('mesmo número'); }
            if (item.valor && n.valor && Math.abs(n.valor - item.valor) < 0.05) { score += 30; motivos.push('mesmo valor'); }
            if (n.emissao) {
                const dias = Math.abs(new Date(n.emissao).getTime() - ref) / 86400000;
                if (dias <= 7) score += 10; else if (dias <= 30) score += 5;
            }
            if (item.storeId && n.storeId === item.storeId) score += 5;
            return { ...n, score, motivos };
        });
        return lista.sort((a, b) => b.score - a.score).slice(0, 20);
    }

    private async nfValida(user: any, empresaId: string, nf: { tipo?: string; id?: string } | null | undefined) {
        if (!nf?.id) return null;
        const tipo = nf.tipo === 'SERVICO' ? 'SERVICO' : 'PRODUTO';
        const achada = tipo === 'SERVICO'
            ? await this.prisma.incomingServiceNf.findFirst({ where: { id: nf.id, store: { empresaId } }, select: { id: true, storeId: true, billId: true } })
            : await this.prisma.incomingGoodsNf.findFirst({ where: { id: nf.id, store: { empresaId } }, select: { id: true, storeId: true, billId: true, purchaseId: true } });
        if (!achada) throw new BadRequestException('Nota fiscal não encontrada.');
        await lojaValida(this.prisma, user, empresaId, achada.storeId);
        return { tipo, ...achada, purchaseId: (achada as any).purchaseId ?? null } as { tipo: 'PRODUTO' | 'SERVICO'; id: string; storeId: string; billId: string | null; purchaseId: string | null };
    }

    // Salva o que foi conferido/editado, sem lançar (loja, fornecedor,
    // valores, vencimentos, NF...).
    async salvar(user: any, id: string, body: any) {
        const item = await this.doUsuario(user, id);
        if (item.status !== 'PENDENTE') throw new BadRequestException('Esse envio já foi tratado.');
        const empresaId = item.empresaId;
        const data: any = {};
        const texto = (v: unknown, max = 250) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

        if (body.storeId !== undefined) {
            data.storeId = body.storeId ? await lojaValida(this.prisma, user, empresaId, body.storeId) : null;
            data.lojaPor = data.storeId ? (data.storeId === item.storeId ? item.lojaPor : 'MANUAL') : null;
        }
        if (body.fornecedor !== undefined) data.fornecedor = texto(body.fornecedor, 200);
        if (body.fornecedorDoc !== undefined) data.fornecedorDoc = so(body.fornecedorDoc) || null;
        if (body.descricao !== undefined) data.descricao = texto(body.descricao);
        if (body.numeroDocumento !== undefined) data.numeroDocumento = texto(body.numeroDocumento, 60);
        if (body.codigoBarras !== undefined) data.codigoBarras = so(body.codigoBarras) || null;
        if (body.tipo !== undefined) data.tipoConta = TIPOS.includes(body.tipo) ? body.tipo : null;
        if (body.formaPagamento !== undefined) data.formaPagamento = FORMAS.includes(body.formaPagamento) ? body.formaPagamento : null;
        if (body.observacao !== undefined) data.observacaoConferencia = texto(body.observacao, 500);
        if (body.categoryId !== undefined) {
            data.categoryId = body.categoryId
                ? (await this.prisma.billCategory.findFirst({ where: { id: body.categoryId, empresaId }, select: { id: true } }))?.id ?? null
                : null;
        }
        if (Array.isArray(body.parcelas)) {
            const parcelas = body.parcelas
                .map((p: any) => ({ valor: Number(String(p?.valor ?? '').replace(',', '.')) || 0, vencimento: String(p?.vencimento ?? '').slice(0, 10) }))
                .filter((p: any) => p.valor > 0 || /^\d{4}-\d{2}-\d{2}$/.test(p.vencimento));
            const total = parcelas.reduce((s: number, p: any) => s + p.valor, 0);
            data.valor = total > 0 ? Math.round(total * 100) / 100 : null;
            data.vencimento = meioDia(parcelas.find((p: any) => /^\d{4}-\d{2}-\d{2}$/.test(p.vencimento))?.vencimento);
            data.parcelas = parcelas.length > 1 ? parcelas : null;
        }
        if (body.nf !== undefined) {
            const nf = await this.nfValida(user, empresaId, body.nf);
            data.nfEntradaId = nf?.tipo === 'PRODUTO' ? nf.id : null;
            data.nfServicoId = nf?.tipo === 'SERVICO' ? nf.id : null;
            // Sem loja ainda: vai para a loja da NF.
            if (nf && !(data.storeId ?? item.storeId)) {
                data.storeId = nf.storeId;
                data.lojaPor = 'NF';
            }
        }
        await this.prisma.contaEnviada.update({ where: { id }, data });
        return { ok: true };
    }

    private async doUsuario(user: any, id: string) {
        const empresaId = empresaDo(user);
        const item = await this.prisma.contaEnviada.findFirst({ where: { id, empresaId }, select: SEM_ARQUIVO });
        if (!item) throw new NotFoundException('Envio não encontrado.');
        if (item.storeId) await lojaValida(this.prisma, user, empresaId, item.storeId);
        return item;
    }

    async arquivo(user: any, id: string) {
        await this.doUsuario(user, id);
        const item = await this.prisma.contaEnviada.findUnique({ where: { id }, select: { arquivo: true, arquivoNome: true, arquivoMime: true } });
        if (!item?.arquivo) throw new NotFoundException('Arquivo não encontrado.');
        return item;
    }

    // Contas a pagar que parecem ser a mesma (pra não lançar duas vezes).
    async parecidas(user: any, id: string) {
        const item = await this.doUsuario(user, id);
        const ors: any[] = [];
        if (item.codigoBarras) ors.push({ barcode: item.codigoBarras });
        if (item.valor && item.valor > 0) {
            const venc = item.vencimento ?? item.createdAt;
            ors.push({
                value: { gte: item.valor - 0.01, lte: item.valor + 0.01 },
                dueDate: { gte: new Date(venc.getTime() - 10 * 86400000), lte: new Date(venc.getTime() + 10 * 86400000) },
            });
        }
        if (!ors.length) return [];
        const lojas = await this.prisma.store.findMany({ where: { empresaId: item.empresaId }, select: { id: true } });
        const contas = await this.prisma.bill.findMany({
            where: { storeId: { in: lojas.map((l) => l.id) }, status: { not: 'CANCELED' }, OR: ors },
            select: { id: true, description: true, value: true, dueDate: true, status: true, barcode: true, supplier: { select: { name: true } }, store: { select: { name: true } } },
            orderBy: { dueDate: 'asc' },
            take: 10,
        });
        return contas.map((c) => ({
            id: c.id,
            descricao: c.description,
            valor: Number(c.value),
            vencimento: c.dueDate,
            status: c.status,
            fornecedor: c.supplier?.name ?? null,
            loja: c.store?.name ?? null,
            mesmoCodigo: !!item.codigoBarras && c.barcode === item.codigoBarras,
        }));
    }

    async descartar(user: any, id: string, motivo?: string) {
        const item = await this.doUsuario(user, id);
        if (item.status !== 'PENDENTE') throw new BadRequestException('Esse envio já foi tratado.');
        await this.prisma.contaEnviada.update({ where: { id }, data: { status: 'DESCARTADA', motivoDescarte: motivo?.trim() || null } });
        return { ok: true };
    }

    // Cria a(s) conta(s) a pagar com o que o financeiro conferiu.
    async lancar(
        user: any,
        id: string,
        body: {
            storeId?: string;
            fornecedor?: string;
            descricao?: string;
            categoryId?: string;
            tipo?: string;
            formaPagamento?: string;
            codigoBarras?: string;
            observacao?: string;
            parcelas?: ParcelaEntrada[];
            nf?: { tipo?: string; id?: string } | null;
            modo?: 'NOVA' | 'ANEXAR';
        },
    ) {
        const item = await this.doUsuario(user, id);
        if (item.status !== 'PENDENTE') throw new BadRequestException('Esse envio já foi tratado.');
        const empresaId = item.empresaId;
        // NF do sistema atrelada (a escolhida agora ou a salva antes).
        const nf = await this.nfValida(user, empresaId, body.nf !== undefined
            ? body.nf
            : item.nfEntradaId ? { tipo: 'PRODUTO', id: item.nfEntradaId } : item.nfServicoId ? { tipo: 'SERVICO', id: item.nfServicoId } : null);
        const camposNf = { nfEntradaId: nf?.tipo === 'PRODUTO' ? nf.id : null, nfServicoId: nf?.tipo === 'SERVICO' ? nf.id : null };
        const storeId = (await lojaValida(this.prisma, user, empresaId, body.storeId || item.storeId || nf?.storeId)) as string | null;
        if (!storeId) throw new BadRequestException('Escolha a loja desta conta.');
        if (nf && nf.storeId !== storeId) {
            throw new BadRequestException('A nota fiscal escolhida é de outra loja. Troque a loja ou a nota.');
        }

        const parcelas = (body.parcelas ?? []).map((p) => ({
            valor: Number(String(p.valor).replace(',', '.')),
            vencimento: String(p.vencimento ?? '').slice(0, 10),
            codigoBarras: so(p.codigoBarras) || undefined,
        }));
        if (!parcelas.length) throw new BadRequestException('Informe ao menos uma parcela (valor e vencimento).');
        parcelas.forEach((p, i) => {
            if (!(p.valor > 0)) throw new BadRequestException(`Parcela ${i + 1}: valor inválido.`);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) throw new BadRequestException(`Parcela ${i + 1}: vencimento inválido.`);
        });

        const descricaoBase = body.descricao?.trim() || item.descricao || item.fornecedor || 'Conta enviada';
        const fornecedorNome = body.fornecedor?.trim();
        const fornecedor = fornecedorNome ? await this.suppliers.findOrCreate(fornecedorNome, user) : null;
        if (fornecedor && item.fornecedorDoc && !fornecedor.cnpj && item.fornecedorDoc.length === 14) {
            await this.prisma.supplier.update({ where: { id: fornecedor.id }, data: { cnpj: item.fornecedorDoc } }).catch(() => null);
        }
        const codigoGeral = body.codigoBarras !== undefined ? so(body.codigoBarras) : item.codigoBarras ?? '';
        const tipo = TIPOS.includes(body.tipo as PayableType)
            ? (body.tipo as PayableType)
            : codigoGeral ? 'BOLETO' : 'NO_BILL';
        const forma = FORMAS.includes(body.formaPagamento as BillPaymentMethod)
            ? (body.formaPagamento as BillPaymentMethod)
            : tipo === 'BOLETO' ? 'BANK_SLIP' : tipo === 'PIX' ? 'PIX' : 'BANK_TRANSFER';
        const categoria = body.categoryId
            ? await this.prisma.billCategory.findFirst({ where: { id: body.categoryId, empresaId }, select: { id: true } })
            : null;

        // O documento vai junto em cada conta (Ver documento).
        const arquivo = await this.prisma.contaEnviada.findUnique({ where: { id }, select: { arquivo: true, arquivoNome: true, arquivoMime: true } });
        const fileUrl = arquivo?.arquivo ? salvarArquivoConta(arquivo.arquivo, arquivo.arquivoNome, arquivo.arquivoMime) : undefined;

        const obs = [
            body.observacao?.trim(),
            item.observacaoEnvio ? `Enviado com a observação: ${item.observacaoEnvio}` : null,
            `Lançada a partir de ${item.tipoDocumento === 'BOLETO' ? 'boleto enviado' : item.tipoDocumento === 'OUTRO' ? 'documento enviado' : 'nota enviada'}${item.enviadoPorNome ? ` por ${item.enviadoPorNome}` : ''} (${item.arquivoNome ?? 'arquivo'}).`,
            item.chaveNfe ? `Chave NF-e: ${item.chaveNfe}` : null,
        ].filter(Boolean).join('\n');

        if (nf?.billId) {
            const existente = await this.prisma.bill.findUnique({ where: { id: nf.billId }, select: { id: true, status: true, fileUrl: true, categoryId: true, notes: true, barcode: true } });
            if (existente && existente.status !== 'CANCELED') {
                if (body.modo !== 'ANEXAR') {
                    throw new BadRequestException('Essa nota já tem conta a pagar no sistema. Use "Anexar à conta da NF" para completar a conta que já existe (vencimento, código de barras e documento) em vez de criar outra.');
                }
                if (parcelas.length > 1) throw new BadRequestException('Para anexar à conta da NF, deixe uma parcela só (divida depois em Contas a Pagar).');
                const p = parcelas[0];
                const paga = existente.status === 'PAID';
                await this.prisma.bill.update({
                    where: { id: existente.id },
                    data: {
                        ...(!paga ? { ...vencimentoUtil(meioDia(p.vencimento)!), value: Number(p.valor.toFixed(2)) } : {}),
                        ...(codigoGeral && !existente.barcode ? { barcode: codigoGeral, type: 'BOLETO', paymentMethod: 'BANK_SLIP' } : {}),
                        ...(fileUrl && !existente.fileUrl ? { fileUrl, hasBillFile: true } : {}),
                        ...(categoria?.id && !existente.categoryId ? { categoryId: categoria.id } : {}),
                        notes: [existente.notes, obs].filter(Boolean).join('\n'),
                        ...(nf.tipo === 'PRODUTO' ? { nfEntradaId: nf.id } : { nfServicoId: nf.id }),
                    },
                });
                await this.prisma.contaEnviada.update({
                    where: { id },
                    data: { status: 'LANCADA', storeId: nf.storeId, billIds: [existente.id], lancadoEm: new Date(), lancadoPor: nomeDo(user), ...camposNf },
                });
                return { criadas: 0, anexada: true, billIds: [existente.id] };
            }
        }

        const ids: string[] = [];
        for (let i = 0; i < parcelas.length; i++) {
            const p = parcelas[i];
            const conta = await this.bills.create({
                description: parcelas.length > 1 ? `${descricaoBase} — parcela ${i + 1}/${parcelas.length}` : descricaoBase,
                value: Number(p.valor.toFixed(2)),
                type: tipo,
                paymentMethod: forma,
                dueDate: p.vencimento,
                storeId,
                supplierId: fornecedor?.id,
                categoryId: categoria?.id,
                barcode: forma === 'BANK_SLIP' ? p.codigoBarras || (parcelas.length === 1 ? codigoGeral || undefined : undefined) : undefined,
                fileUrl,
                hasBillFile: !!fileUrl,
                notes: obs,
            } as any, user);
            ids.push(conta.id);
        }

        if (nf) {
            await this.prisma.bill.updateMany({ where: { id: { in: ids } }, data: nf.tipo === 'PRODUTO' ? { nfEntradaId: nf.id } : { nfServicoId: nf.id } });
            if (nf.tipo === 'PRODUTO') {
                await this.prisma.incomingGoodsNf.updateMany({ where: { id: nf.id, billId: null }, data: { billId: ids[0] } });
                if (nf.purchaseId) await this.prisma.bill.updateMany({ where: { id: { in: ids } }, data: { purchaseId: nf.purchaseId } });
            } else {
                await this.prisma.incomingServiceNf.updateMany({ where: { id: nf.id, billId: null }, data: { billId: ids[0] } });
            }
        }

        await this.prisma.contaEnviada.update({
            where: { id },
            data: { status: 'LANCADA', storeId, billIds: ids, lancadoEm: new Date(), lancadoPor: nomeDo(user), ...camposNf },
        });
        return { criadas: ids.length, billIds: ids };
    }
}
