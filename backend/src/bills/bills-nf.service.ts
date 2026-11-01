import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ensureStoreAccessScoped, resolveAllowedStoreIds } from '../common/store-scope.util';

// =============================================================================
// NF ↔ Conta a Pagar. Cada conta pode apontar para a NF de entrada (produto)
// ou NFS-e (serviço) que já está no sistema — várias contas (parcelas) podem
// apontar para a mesma NF. O vínculo é editável: atrelar, trocar e remover.
// "Vincular automaticamente" liga as contas pela chave da NF-e que veio no
// documento/Omie, ou pelo CNPJ do fornecedor + número da NF.
// =============================================================================

export type TipoNf = 'PRODUTO' | 'SERVICO';

export type NfCandidata = {
    tipo: TipoNf;
    id: string;
    chave: string;
    numero: string | null;
    emitente: string | null;
    emitenteDoc: string | null;
    valor: number | null;
    emissao: string | null;
    storeId: string;
    // Outras contas já ligadas a essa NF (ex.: as outras parcelas).
    contasVinculadas: { id: string; descricao: string; valor: number; vencimento: string }[];
    score?: number;
    motivos?: string[];
};

const so = (t?: string | null) => String(t ?? '').replace(/\D/g, '');
const semZeros = (t: string) => t.replace(/^0+/, '') || '0';
const dataISO = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const numeroDaChave = (chave: string) => (/^\d{44}$/.test(chave) ? semZeros(chave.slice(25, 34)) : null);

const EVENTOS = ['resEvento', 'procEventoNFe'];

// Chave da NF-e, CNPJ do fornecedor e número da NF que dá pra tirar da conta
// (observações do Omie / do Lançar Contas e a descrição "… — NF 1234").
export function pistasDaConta(b: { description: string; notes: string | null; supplier?: { cnpj: string | null } | null }) {
    const notas = b.notes ?? '';
    const chave = /(?:chave[^\d]{0,20})(\d{44})/i.exec(notas)?.[1] ?? /(?<!\d)(\d{44})(?!\d)/.exec(notas)?.[1] ?? null;
    const cnpjNota = /CNPJ\/CPF do fornecedor:\s*([\d./-]+)/i.exec(notas)?.[1];
    const cnpj = so(b.supplier?.cnpj) || so(cnpjNota) || (chave ? chave.slice(6, 20) : '');
    const numeroTexto = /\bNF[\s-]*(?:e\s*)?(?:n[ºo°.]?\s*)?(\d{1,9})\b/i.exec(b.description)?.[1]
        ?? /\bNFE?\s*n[ºo°]\s*0*(\d{1,9})/i.exec(notas)?.[1]
        ?? null;
    const numero = chave ? numeroDaChave(chave) : numeroTexto ? semZeros(numeroTexto) : null;
    return { chave, cnpj: cnpj.length === 14 || cnpj.length === 11 ? cnpj : null, numero };
}

const GOODS_SELECT = {
    id: true, chaveAcesso: true, issuerName: true, issuerCnpj: true, value: true, issueDate: true, storeId: true, billId: true, purchaseId: true,
    contasVinculadas: { select: { id: true, description: true, value: true, dueDate: true } },
} as const;
const SERVICE_SELECT = {
    id: true, chaveAcesso: true, numeroNf: true, issuerName: true, issuerDoc: true, value: true, issueDate: true, storeId: true, billId: true,
    contasVinculadas: { select: { id: true, description: true, value: true, dueDate: true } },
} as const;

function contasResumo(lista: { id: string; description: string; value: any; dueDate: Date }[]) {
    return lista.map((c) => ({ id: c.id, descricao: c.description, valor: Number(c.value), vencimento: c.dueDate.toISOString().slice(0, 10) }));
}
function deGoods(n: any): NfCandidata {
    return {
        tipo: 'PRODUTO', id: n.id, chave: n.chaveAcesso, numero: numeroDaChave(n.chaveAcesso),
        emitente: n.issuerName ?? null, emitenteDoc: so(n.issuerCnpj) || null,
        valor: n.value != null ? Number(n.value) : null, emissao: dataISO(n.issueDate), storeId: n.storeId,
        contasVinculadas: contasResumo(n.contasVinculadas ?? []),
    };
}
function deService(n: any): NfCandidata {
    return {
        tipo: 'SERVICO', id: n.id, chave: n.chaveAcesso, numero: n.numeroNf ? semZeros(so(n.numeroNf)) : null,
        emitente: n.issuerName ?? null, emitenteDoc: so(n.issuerDoc) || null,
        valor: n.value != null ? Number(n.value) : null, emissao: dataISO(n.issueDate), storeId: n.storeId,
        contasVinculadas: contasResumo(n.contasVinculadas ?? []),
    };
}

@Injectable()
export class BillsNfService {
    constructor(private readonly prisma: PrismaService) { }

    private async conta(user: any, id: string) {
        const bill = await this.prisma.bill.findUnique({
            where: { id },
            select: {
                id: true, storeId: true, description: true, notes: true, value: true, dueDate: true, purchaseId: true,
                nfEntradaId: true, nfServicoId: true, supplier: { select: { cnpj: true, name: true } },
            },
        });
        if (!bill) throw new NotFoundException('Conta não encontrada.');
        await ensureStoreAccessScoped(this.prisma, bill.storeId, user);
        return bill;
    }

    // NFs da loja da conta que podem ser dela (ou o que for buscado).
    async candidatas(user: any, id: string, busca?: string): Promise<NfCandidata[]> {
        const bill = await this.conta(user, id);
        const pistas = pistasDaConta(bill);
        const q = String(busca ?? '').trim();
        const qDig = so(q);
        const qValor = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(q) ? Number(q.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) : null;
        const valor = Number(bill.value);

        const gOr: any[] = [];
        const sOr: any[] = [];
        if (q) {
            gOr.push({ issuerName: { contains: q, mode: 'insensitive' } });
            sOr.push({ issuerName: { contains: q, mode: 'insensitive' } });
            if (qDig.length >= 3) {
                gOr.push({ chaveAcesso: { contains: qDig } }, { issuerCnpj: { contains: qDig } });
                sOr.push({ numeroNf: { contains: qDig } }, { issuerDoc: { contains: qDig } }, { chaveAcesso: { contains: qDig } });
            }
            if (qValor) {
                gOr.push({ value: { gte: qValor - 0.01, lte: qValor + 0.01 } });
                sOr.push({ value: { gte: qValor - 0.01, lte: qValor + 0.01 } });
            }
        } else {
            if (pistas.chave) { gOr.push({ chaveAcesso: pistas.chave }); sOr.push({ chaveAcesso: pistas.chave }); }
            if (pistas.cnpj) { gOr.push({ issuerCnpj: pistas.cnpj }); sOr.push({ issuerDoc: pistas.cnpj }); }
            if (pistas.numero) {
                gOr.push({ chaveAcesso: { contains: pistas.numero.padStart(9, '0') } });
                sOr.push({ numeroNf: { contains: pistas.numero } });
            }
            if (valor > 0) {
                gOr.push({ value: { gte: valor - 0.05, lte: valor + 0.05 } });
                sOr.push({ value: { gte: valor - 0.05, lte: valor + 0.05 } });
            }
        }
        const base = { storeId: bill.storeId, ignored: false, tipoDocumento: { notIn: EVENTOS } };
        const [goods, services] = await Promise.all([
            this.prisma.incomingGoodsNf.findMany({ where: gOr.length ? { ...base, OR: gOr } : base, select: GOODS_SELECT, orderBy: { issueDate: 'desc' }, take: 80 }),
            this.prisma.incomingServiceNf.findMany({ where: sOr.length ? { ...base, OR: sOr } : base, select: SERVICE_SELECT, orderBy: { issueDate: 'desc' }, take: 40 }),
        ]);
        const ref = bill.dueDate.getTime();
        return [...goods.map(deGoods), ...services.map(deService)]
            .map((n) => {
                let score = 0;
                const motivos: string[] = [];
                if (pistas.chave && n.chave === pistas.chave) { score += 100; motivos.push('mesma chave'); }
                if (pistas.cnpj && n.emitenteDoc === pistas.cnpj) { score += 40; motivos.push('mesmo fornecedor'); }
                if (pistas.numero && n.numero === pistas.numero) { score += 40; motivos.push('mesmo número'); }
                if (n.valor && valor > 0 && Math.abs(n.valor - valor) < 0.05) { score += 30; motivos.push('mesmo valor'); }
                if (n.emissao) {
                    const dias = Math.abs(new Date(`${n.emissao}T12:00:00Z`).getTime() - ref) / 86_400_000;
                    if (dias <= 45) score += 10; else if (dias <= 90) score += 4;
                }
                return { ...n, score, motivos };
            })
            .sort((a, b) => b.score! - a.score!)
            .slice(0, 25);
    }

    async vincular(user: any, id: string, body: { tipo?: string; nfId?: string }) {
        const bill = await this.conta(user, id);
        const tipo: TipoNf = body?.tipo === 'SERVICO' ? 'SERVICO' : 'PRODUTO';
        if (!body?.nfId) throw new BadRequestException('Escolha a nota fiscal.');
        const nf = tipo === 'PRODUTO'
            ? await this.prisma.incomingGoodsNf.findUnique({ where: { id: body.nfId }, select: { id: true, storeId: true, billId: true, purchaseId: true } })
            : await this.prisma.incomingServiceNf.findUnique({ where: { id: body.nfId }, select: { id: true, storeId: true, billId: true } });
        if (!nf) throw new NotFoundException('Nota fiscal não encontrada.');
        if (nf.storeId !== bill.storeId) throw new BadRequestException('Essa nota é de outra loja.');
        await this.ligar(bill.id, tipo, nf, bill.purchaseId);
        return { ok: true };
    }

    private async ligar(billId: string, tipo: TipoNf, nf: { id: string; billId: string | null; purchaseId?: string | null }, purchaseIdAtual: string | null) {
        await this.prisma.$transaction(async (tx) => {
            // Troca: se a conta estava em outra NF, solta a anterior.
            await this.soltarDaConta(tx, billId);
            await tx.bill.update({
                where: { id: billId },
                data: {
                    nfEntradaId: tipo === 'PRODUTO' ? nf.id : null,
                    nfServicoId: tipo === 'SERVICO' ? nf.id : null,
                    ...(tipo === 'PRODUTO' && nf.purchaseId && !purchaseIdAtual ? { purchaseId: nf.purchaseId } : {}),
                },
            });
            // A tela de NF de entrada continua sabendo que a nota já tem conta.
            if (!nf.billId) {
                if (tipo === 'PRODUTO') await tx.incomingGoodsNf.update({ where: { id: nf.id }, data: { billId } });
                else await tx.incomingServiceNf.update({ where: { id: nf.id }, data: { billId } });
            }
        });
    }

    // Solta a conta da NF em que ela estiver (e acerta o billId da NF).
    private async soltarDaConta(tx: any, billId: string) {
        const atual = await tx.bill.findUnique({ where: { id: billId }, select: { nfEntradaId: true, nfServicoId: true } });
        const goods = await tx.incomingGoodsNf.findMany({ where: { OR: [{ billId }, ...(atual?.nfEntradaId ? [{ id: atual.nfEntradaId }] : [])] }, select: { id: true, billId: true } });
        const services = await tx.incomingServiceNf.findMany({ where: { OR: [{ billId }, ...(atual?.nfServicoId ? [{ id: atual.nfServicoId }] : [])] }, select: { id: true, billId: true } });
        await tx.bill.update({ where: { id: billId }, data: { nfEntradaId: null, nfServicoId: null } });
        for (const n of goods) {
            if (n.billId !== billId) continue;
            const outra = await tx.bill.findFirst({ where: { nfEntradaId: n.id, id: { not: billId } }, select: { id: true } });
            await tx.incomingGoodsNf.update({ where: { id: n.id }, data: { billId: outra?.id ?? null } });
        }
        for (const n of services) {
            if (n.billId !== billId) continue;
            const outra = await tx.bill.findFirst({ where: { nfServicoId: n.id, id: { not: billId } }, select: { id: true } });
            await tx.incomingServiceNf.update({ where: { id: n.id }, data: { billId: outra?.id ?? null } });
        }
    }

    async desvincular(user: any, id: string) {
        const bill = await this.conta(user, id);
        await this.prisma.$transaction((tx) => this.soltarDaConta(tx, bill.id));
        return { ok: true };
    }

    // Liga sozinho as contas sem NF, só quando não há dúvida: mesma chave da
    // NF-e, ou mesmo CNPJ do fornecedor + mesmo número de NF (na mesma loja).
    async vincularAutomatico(user: any | null, storeId?: string) {
        let lojas: string[] | undefined;
        if (user) {
            lojas = await resolveAllowedStoreIds(this.prisma, user);
            if (storeId) {
                await ensureStoreAccessScoped(this.prisma, storeId, user);
                lojas = [storeId];
            }
        } else if (storeId) {
            lojas = [storeId];
        }
        const filtroLoja = lojas ? { storeId: { in: lojas } } : {};

        const contas = await this.prisma.bill.findMany({
            where: { ...filtroLoja, status: { not: 'CANCELED' }, nfEntradaId: null, nfServicoId: null },
            select: { id: true, storeId: true, description: true, notes: true, purchaseId: true, supplier: { select: { cnpj: true } } },
        });
        if (!contas.length) return { analisadas: 0, vinculadas: 0 };
        const storeIds = [...new Set(contas.map((c) => c.storeId))];
        const [goods, services] = await Promise.all([
            this.prisma.incomingGoodsNf.findMany({
                where: { storeId: { in: storeIds }, ignored: false, tipoDocumento: { notIn: EVENTOS } },
                select: { id: true, storeId: true, chaveAcesso: true, issuerCnpj: true, billId: true, purchaseId: true },
            }),
            this.prisma.incomingServiceNf.findMany({
                where: { storeId: { in: storeIds }, ignored: false, tipoDocumento: { notIn: EVENTOS } },
                select: { id: true, storeId: true, chaveAcesso: true, issuerDoc: true, numeroNf: true, billId: true },
            }),
        ]);
        const porChave = new Map<string, { tipo: TipoNf; nf: any }>();
        const porNumero = new Map<string, { tipo: TipoNf; nf: any }[]>();
        const add = (k: string, v: { tipo: TipoNf; nf: any }) => porNumero.set(k, [...(porNumero.get(k) ?? []), v]);
        for (const n of goods) {
            porChave.set(`${n.storeId}|${n.chaveAcesso}`, { tipo: 'PRODUTO', nf: n });
            const num = numeroDaChave(n.chaveAcesso);
            if (num && n.issuerCnpj) add(`${n.storeId}|${so(n.issuerCnpj)}|${num}`, { tipo: 'PRODUTO', nf: n });
        }
        for (const n of services) {
            porChave.set(`${n.storeId}|${n.chaveAcesso}`, { tipo: 'SERVICO', nf: n });
            if (n.numeroNf && n.issuerDoc) add(`${n.storeId}|${so(n.issuerDoc)}|${semZeros(so(n.numeroNf))}`, { tipo: 'SERVICO', nf: n });
        }

        let vinculadas = 0;
        for (const c of contas) {
            const p = pistasDaConta(c);
            let achada = p.chave ? porChave.get(`${c.storeId}|${p.chave}`) : undefined;
            if (!achada && p.cnpj && p.numero) {
                const lista = porNumero.get(`${c.storeId}|${p.cnpj}|${p.numero}`) ?? [];
                if (lista.length === 1) achada = lista[0];
            }
            if (!achada) continue;
            await this.ligar(c.id, achada.tipo, achada.nf, c.purchaseId);
            if (!achada.nf.billId) achada.nf.billId = c.id;
            vinculadas++;
        }
        return { analisadas: contas.length, vinculadas };
    }
}

