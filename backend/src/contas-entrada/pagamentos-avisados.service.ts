import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { BillsService } from '../bills/bills.service';
import { DadosComprovante, parseTextoComprovante } from './comprovante-parser';
import { LimiteEnvios, empresaDo, filtroLoja, lerPdf, lojaDoDocumento, lojaValida, nomeDo, norm, salvarArquivoConta } from './entrada.util';
import type { ArquivoEntrada } from './contas-enviadas.service';

// =============================================================================
// Registrar Pagamentos: quem pagou avisa (valor + fornecedor e/ou
// comprovante). O financeiro concilia: dá baixa numa conta a pagar, cria a
// conta já paga, ou só marca como conciliado.
// =============================================================================

const SELECT = {
    id: true, empresaId: true, storeId: true, lojaPor: true, fornecedor: true, valor: true, dataPagamento: true,
    descricao: true, avisadoPorNome: true, status: true, conciliadoEm: true, conciliadoPor: true, billId: true,
    observacaoFinanceiro: true, createdAt: true, categoryId: true, comprovanteNome: true, comprovanteMime: true,
} as const;

@Injectable()
export class PagamentosAvisadosService {
    private limite = new LimiteEnvios(30);

    constructor(
        private readonly prisma: PrismaService,
        private readonly bills: BillsService,
    ) { }

    async lerComprovante(file?: ArquivoEntrada): Promise<DadosComprovante | null> {
        if (!file || !(file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || ''))) return null;
        const texto = await lerPdf(file.buffer);
        return texto ? parseTextoComprovante(texto) : null;
    }

    async registrar(
        empresaId: string,
        file: ArquivoEntrada | undefined,
        body: { fornecedor?: string; valor?: string | number; data?: string; descricao?: string; categoryId?: string },
        opcoes: { avisadoPor?: string | null; storePadrao?: string | null; lojasCanal?: string[]; lido?: DadosComprovante | null },
    ) {
        const lido = opcoes.lido !== undefined ? opcoes.lido : await this.lerComprovante(file);

        const valorDigitado = Number(String(body.valor ?? '').replace(/\./g, (m, i, t) => (String(t).includes(',') ? '' : m)).replace(',', '.'));
        const valor = valorDigitado > 0 ? valorDigitado : (lido?.valor ?? 0);
        const fornecedor = body.fornecedor?.trim() || lido?.destinatario || '';
        const descricao = body.descricao?.trim() || lido?.descricao || null;
        const dataISO = (body.data && /^\d{4}-\d{2}-\d{2}$/.test(body.data) ? body.data : null) || lido?.data || null;

        if (!file && (!fornecedor || !valor || valor <= 0)) {
            throw new BadRequestException('Envie o comprovante ou informe fornecedor e valor.');
        }
        if (lido?.idTransacao) {
            const repetido = await this.prisma.pagamentoAvisado.findFirst({ where: { empresaId, idTransacao: lido.idTransacao }, select: { id: true } });
            if (repetido) throw new BadRequestException('Este comprovante já foi enviado antes.');
        }

        const loja = await lojaDoDocumento(this.prisma, empresaId, lido?.documentos ?? [], { padrao: opcoes.storePadrao, permitidas: opcoes.lojasCanal });
        const categoria = body.categoryId
            ? await this.prisma.billCategory.findFirst({ where: { id: body.categoryId, empresaId }, select: { id: true } })
            : null;

        return this.prisma.pagamentoAvisado.create({
            data: {
                empresaId,
                storeId: loja.storeId,
                lojaPor: loja.lojaPor,
                categoryId: categoria?.id ?? null,
                fornecedor: fornecedor || 'Não informado (ver comprovante)',
                valor: valor > 0 ? valor : 0,
                dataPagamento: dataISO ? new Date(`${dataISO}T12:00:00.000Z`) : new Date(),
                descricao,
                comprovante: file ? new Uint8Array(file.buffer) : null,
                comprovanteNome: file?.originalname ?? null,
                comprovanteMime: file?.mimetype ?? null,
                avisadoPorNome: opcoes.avisadoPor ?? null,
                idTransacao: lido?.idTransacao ?? null,
            },
            select: SELECT,
        });
    }

    async criar(user: any, body: any, file?: ArquivoEntrada) {
        const empresaId = empresaDo(user);
        const storePadrao = await lojaValida(this.prisma, user, empresaId, body?.storeId);
        return this.registrar(empresaId, file, body ?? {}, { avisadoPor: nomeDo(user), storePadrao });
    }

    // ---------- Link secreto (um por loja) ----------

    async obterLink(user: any, storeId: string) {
        await lojaValida(this.prisma, user, empresaDo(user), storeId);
        const s = await this.prisma.store.findUnique({ where: { id: storeId }, select: { tokenAvisoPagamento: true } });
        return { token: s?.tokenAvisoPagamento ?? null };
    }

    async gerarLink(user: any, storeId: string) {
        await lojaValida(this.prisma, user, empresaDo(user), storeId);
        const token = randomBytes(24).toString('hex');
        await this.prisma.store.update({ where: { id: storeId }, data: { tokenAvisoPagamento: token } });
        return { token };
    }

    async revogarLink(user: any, storeId: string) {
        await lojaValida(this.prisma, user, empresaDo(user), storeId);
        await this.prisma.store.update({ where: { id: storeId }, data: { tokenAvisoPagamento: null } });
        return { token: null };
    }

    async lojaDoToken(token: string, contar = false) {
        if (!token || token.length < 20) throw new NotFoundException('Link inválido.');
        const loja = await this.prisma.store.findUnique({
            where: { tokenAvisoPagamento: token },
            select: { id: true, name: true, active: true, empresaId: true, empresa: { select: { active: true } } },
        });
        if (!loja || !loja.active || !loja.empresa.active) throw new NotFoundException('Link inválido ou desativado.');
        if (contar) this.limite.contar(token);
        return loja;
    }

    // ---------- Tela do financeiro ----------

    async listar(user: any, status?: string, storeId?: string) {
        const empresaId = empresaDo(user);
        const st = status === 'CONCILIADO' || status === 'DESCARTADO' ? status : 'PENDENTE';
        const itens = await this.prisma.pagamentoAvisado.findMany({
            where: { empresaId, status: st, ...(await filtroLoja(this.prisma, user, storeId)) },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: SELECT,
        });
        const [lojas, categorias] = await Promise.all([
            this.prisma.store.findMany({ where: { empresaId }, select: { id: true, name: true } }),
            this.prisma.billCategory.findMany({ where: { empresaId }, select: { id: true, name: true } }),
        ]);
        return itens.map((i) => ({
            ...i,
            temComprovante: !!i.comprovanteNome,
            lojaNome: lojas.find((l) => l.id === i.storeId)?.name ?? null,
            categoriaNome: categorias.find((c) => c.id === i.categoryId)?.name ?? null,
        }));
    }

    private async doUsuario(user: any, id: string) {
        const empresaId = empresaDo(user);
        const aviso = await this.prisma.pagamentoAvisado.findFirst({ where: { id, empresaId }, select: SELECT });
        if (!aviso) throw new NotFoundException('Aviso não encontrado.');
        if (aviso.storeId) await lojaValida(this.prisma, user, empresaId, aviso.storeId);
        return aviso;
    }

    async comprovante(user: any, id: string) {
        await this.doUsuario(user, id);
        const item = await this.prisma.pagamentoAvisado.findUnique({ where: { id }, select: { comprovante: true, comprovanteNome: true, comprovanteMime: true } });
        if (!item?.comprovante) throw new NotFoundException('Comprovante não encontrado.');
        return item;
    }

    // Contas em aberto parecidas (mesmo valor e/ou fornecedor parecido).
    async sugestoes(user: any, id: string) {
        const aviso = await this.doUsuario(user, id);
        const lojas = aviso.storeId
            ? [aviso.storeId]
            : (await this.prisma.store.findMany({ where: { empresaId: aviso.empresaId }, select: { id: true } })).map((l) => l.id);
        const contas = await this.prisma.bill.findMany({
            where: { storeId: { in: lojas }, status: { in: ['OPEN', 'OVERDUE'] } },
            select: { id: true, description: true, value: true, dueDate: true, supplier: { select: { name: true } }, store: { select: { name: true } } },
            orderBy: { dueDate: 'asc' },
            take: 2000,
        });
        const palavras = norm(aviso.fornecedor).split(/[^A-Z0-9]+/).filter((p) => p.length > 2);
        return contas
            .map((c) => {
                const nome = norm(`${c.supplier?.name ?? ''} ${c.description}`);
                const texto = palavras.filter((p) => nome.includes(p)).length;
                const valor = Number(c.value);
                const dif = Math.abs(valor - aviso.valor);
                const valorIgual = aviso.valor > 0 && dif < 0.01;
                const valorPerto = aviso.valor > 0 && dif / aviso.valor < 0.1;
                const pontos = (valorIgual ? 60 : valorPerto ? 25 : 0) + Math.min(texto, 3) * 12;
                return {
                    pontos,
                    conta: { id: c.id, descricao: c.description, vencimento: c.dueDate, valor, fornecedor: c.supplier?.name ?? null, loja: c.store?.name ?? null },
                };
            })
            .filter((x) => x.pontos >= 12)
            .sort((a, b) => b.pontos - a.pontos)
            .slice(0, 6);
    }

    // Dá baixa numa conta (billId), cria a conta já paga (criarConta) ou só
    // marca como conciliado. O comprovante vai junto pra conta.
    async conciliar(
        user: any,
        id: string,
        body: { billId?: string; criarConta?: boolean; valorPago?: number | string; storeId?: string; categoryId?: string; descricao?: string; observacao?: string },
    ) {
        const aviso = await this.doUsuario(user, id);
        if (aviso.status !== 'PENDENTE') throw new BadRequestException('Esse aviso já foi tratado.');

        const digitado = Number(String(body.valorPago ?? '').replace(/\./g, (m, i, t) => (String(t).includes(',') ? '' : m)).replace(',', '.'));
        const valorPago = digitado > 0 ? digitado : aviso.valor;
        const dataISO = aviso.dataPagamento.toISOString().slice(0, 10);
        const obs = `Pagamento avisado: ${aviso.fornecedor}${aviso.descricao ? ` — ${aviso.descricao}` : ''}${body.observacao?.trim() ? ` (${body.observacao.trim()})` : ''}`;

        const arq = aviso.comprovanteNome
            ? await this.prisma.pagamentoAvisado.findUnique({ where: { id }, select: { comprovante: true, comprovanteNome: true, comprovanteMime: true } })
            : null;
        const comprovanteUrl = arq?.comprovante ? salvarArquivoConta(arq.comprovante, arq.comprovanteNome, arq.comprovanteMime) : null;

        let billId: string | null = null;
        if (body.billId) {
            const conta = await this.prisma.bill.findUnique({ where: { id: body.billId }, select: { id: true, storeId: true, value: true, status: true, store: { select: { empresaId: true } } } });
            if (!conta || conta.store.empresaId !== aviso.empresaId) throw new NotFoundException('Conta a pagar não encontrada.');
            await lojaValida(this.prisma, user, aviso.empresaId, conta.storeId);
            const extra = valorPago - Number(conta.value);
            const nota = `${obs}${extra > 0.01 ? ` — pago ${valorPago.toFixed(2).replace('.', ',')} (inclui ${extra.toFixed(2).replace('.', ',')} de juros/multa)` : ''}`;
            await this.bills.markAsPaid(conta.id, user, `${dataISO}T12:00:00.000Z`, nota);
            if (comprovanteUrl) await this.prisma.bill.update({ where: { id: conta.id }, data: { paymentProofUrl: comprovanteUrl } });
            billId = conta.id;
        } else if (body.criarConta) {
            if (!valorPago || valorPago <= 0) throw new BadRequestException('Informe o valor pago para criar a conta.');
            const storeId = await lojaValida(this.prisma, user, aviso.empresaId, body.storeId || aviso.storeId);
            if (!storeId) throw new BadRequestException('Escolha a loja da conta.');
            const nome = aviso.fornecedor.startsWith('Não informado') ? null : aviso.fornecedor;
            const fornecedor = nome
                ? await this.prisma.supplier.findFirst({ where: { empresaId: aviso.empresaId, name: { equals: nome, mode: 'insensitive' } }, select: { id: true } })
                : null;
            const categoria = (body.categoryId || aviso.categoryId)
                ? await this.prisma.billCategory.findFirst({ where: { id: body.categoryId || aviso.categoryId!, empresaId: aviso.empresaId }, select: { id: true } })
                : null;
            const conta = await this.bills.create({
                description: body.descricao?.trim() || aviso.descricao || nome || 'Pagamento avisado',
                value: Number(valorPago.toFixed(2)),
                type: 'NO_BILL',
                paymentMethod: 'PIX',
                dueDate: dataISO,
                storeId,
                supplierId: fornecedor?.id,
                categoryId: categoria?.id,
                notes: obs,
                paymentProofUrl: comprovanteUrl ?? undefined,
            } as any, user);
            await this.bills.markAsPaid(conta.id, user, `${dataISO}T12:00:00.000Z`);
            billId = conta.id;
        }

        return this.prisma.pagamentoAvisado.update({
            where: { id },
            data: {
                status: 'CONCILIADO',
                conciliadoEm: new Date(),
                conciliadoPor: nomeDo(user),
                billId,
                observacaoFinanceiro: body.observacao?.trim() || null,
            },
            select: SELECT,
        });
    }

    async descartar(user: any, id: string) {
        await this.doUsuario(user, id);
        return this.prisma.pagamentoAvisado.update({
            where: { id },
            data: { status: 'DESCARTADO', conciliadoEm: new Date(), conciliadoPor: nomeDo(user) },
            select: SELECT,
        });
    }
}
