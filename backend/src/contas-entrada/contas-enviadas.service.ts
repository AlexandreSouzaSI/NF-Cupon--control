import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BillPaymentMethod, PayableType } from '@prisma/client';
import { randomBytes } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { BillsService } from '../bills/bills.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { lerDocumentoComIa } from './documento-ia';
import { DocumentoLido, documentoVazio, lerTextoDocumento, lerXmlDocumento } from './documento-parser';
import { LimiteEnvios, empresaDo, filtroLoja, lerPdf, lojaDoDocumento, lojaValida, nomeDo, salvarArquivoConta, so } from './entrada.util';

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
} as const;
const dataISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const meioDia = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00.000Z`) : null);

const TIPOS: PayableType[] = ['BOLETO', 'PIX', 'CARD', 'NO_BILL'];
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
                const lidos = await lerDocumentoComIa(file);
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
        },
    ) {
        if (!file) throw new BadRequestException('Anexe o boleto ou a nota (PDF, XML ou foto).');
        const lidos = opcoes.lido ? [opcoes.lido] : await this.lerDocumentos(file);
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

        return this.prisma.contaEnviada.create({
            data: {
                empresaId,
                storeId: loja.storeId,
                lojaPor: loja.lojaPor,
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
        return itens.map((i) => ({
            ...i,
            vencimento: dataISO(i.vencimento),
            emissao: dataISO(i.emissao),
            temArquivo: !!i.arquivoNome,
            lojaNome: lojas.find((l) => l.id === i.storeId)?.name ?? null,
            categoriaNome: categorias.find((c) => c.id === i.categoryId)?.name ?? null,
        }));
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
        },
    ) {
        const item = await this.doUsuario(user, id);
        if (item.status !== 'PENDENTE') throw new BadRequestException('Esse envio já foi tratado.');
        const empresaId = item.empresaId;
        const storeId = (await lojaValida(this.prisma, user, empresaId, body.storeId || item.storeId)) as string | null;
        if (!storeId) throw new BadRequestException('Escolha a loja desta conta.');

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
            `Lançada a partir de ${item.tipoDocumento === 'BOLETO' ? 'boleto' : item.tipoDocumento === 'OUTRO' ? 'documento' : 'nota'} enviado${item.enviadoPorNome ? ` por ${item.enviadoPorNome}` : ''} (${item.arquivoNome ?? 'arquivo'}).`,
            item.chaveNfe ? `Chave NF-e: ${item.chaveNfe}` : null,
        ].filter(Boolean).join('\n');

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

        await this.prisma.contaEnviada.update({
            where: { id },
            data: { status: 'LANCADA', storeId, billIds: ids, lancadoEm: new Date(), lancadoPor: nomeDo(user) },
        });
        return { criadas: ids.length, billIds: ids };
    }
}
