import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { resolveAllowedStoreIds } from '../common/store-scope.util';

// =============================================================================
// Coisas comuns de Lançar Contas / Registrar Pagamentos / Conciliação do
// Extrato / Recebimento automático.
// =============================================================================

export const so = (t?: string | null) => String(t ?? '').replace(/\D/g, '');
export const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Empresa do usuário (Admin Master: a da loja ativa no topo).
export function empresaDo(user: any): string {
    const empresaId = user?.isAdminMaster ? user?.activeStoreEmpresaId : user?.empresaId;
    if (!empresaId) {
        throw new BadRequestException('Selecione uma loja no topo do sistema.');
    }
    return empresaId as string;
}

export function nomeDo(user: any): string | null {
    return user?.name || user?.email || null;
}

// Gerar/desativar links e conectar WhatsApp/e-mail: só quem manda.
export function exigirGestor(user: any) {
    if (user?.isAdminMaster || user?.role === UserRole.PROPRIETARIO || user?.role === UserRole.ADMINISTRATIVO) return;
    throw new ForbiddenException('Só o proprietário ou o administrativo pode fazer isso.');
}

// Lojas da empresa que o usuário enxerga (undefined = todas da empresa).
export async function lojasPermitidas(prisma: PrismaService, user: any): Promise<string[] | undefined> {
    return resolveAllowedStoreIds(prisma, user);
}

// Filtro das listas: a loja escolhida (ou as permitidas) + as que ainda não
// têm loja identificada.
export async function filtroLoja(prisma: PrismaService, user: any, storeId?: string) {
    const permitidas = await lojasPermitidas(prisma, user);
    if (storeId) {
        if (permitidas && !permitidas.includes(storeId)) throw new ForbiddenException('Você não tem acesso a esta loja.');
        return { OR: [{ storeId }, { storeId: null }] };
    }
    if (!permitidas) return {};
    return { OR: [{ storeId: { in: permitidas } }, { storeId: null }] };
}

// Garante que a loja é da empresa (e que o usuário pode usar).
export async function lojaValida(prisma: PrismaService, user: any, empresaId: string, storeId?: string | null): Promise<string | null> {
    if (!storeId) return null;
    const loja = await prisma.store.findFirst({ where: { id: storeId, empresaId }, select: { id: true } });
    if (!loja) throw new BadRequestException('Loja inválida.');
    const permitidas = await lojasPermitidas(prisma, user);
    if (permitidas && !permitidas.includes(storeId)) throw new ForbiddenException('Você não tem acesso a esta loja.');
    return loja.id;
}

// Acha a loja do documento pelo CNPJ/CPF que aparece nele (pagador do
// boleto, destinatário da nota). Se não achar e só houver uma loja possível
// (o canal atende uma loja só), usa ela.
export async function lojaDoDocumento(
    prisma: PrismaService,
    empresaId: string,
    documentos: string[],
    opcoes: { excluir?: string | null; padrao?: string | null; permitidas?: string[] } = {},
): Promise<{ storeId: string | null; lojaPor: string | null }> {
    const lojas = await prisma.store.findMany({
        where: { empresaId, active: true },
        select: { id: true, cnpj: true, cpf: true },
    });
    const docs = new Set(documentos.map(so).filter((d) => d.length === 11 || d.length === 14));
    if (opcoes.excluir) docs.delete(so(opcoes.excluir));
    const achadas = lojas.filter((l) => (so(l.cnpj) && docs.has(so(l.cnpj))) || (so(l.cpf) && docs.has(so(l.cpf))));
    if (achadas.length === 1) return { storeId: achadas[0].id, lojaPor: 'CNPJ' };
    if (opcoes.padrao && lojas.some((l) => l.id === opcoes.padrao)) return { storeId: opcoes.padrao, lojaPor: 'LINK' };
    const possiveis = opcoes.permitidas?.length ? lojas.filter((l) => opcoes.permitidas!.includes(l.id)) : lojas;
    if (possiveis.length === 1) return { storeId: possiveis[0].id, lojaPor: 'CANAL' };
    return { storeId: null, lojaPor: null };
}

// Grava o arquivo em uploads/bills (servido em /uploads/bills/...) e devolve a URL.
export function salvarArquivoConta(buffer: Buffer | Uint8Array, nomeOriginal: string | null, mime: string | null): string {
    const pasta = join(process.cwd(), 'uploads', 'bills');
    if (!existsSync(pasta)) mkdirSync(pasta, { recursive: true });
    let ext = extname(nomeOriginal ?? '').toLowerCase();
    if (!ext) ext = /pdf/.test(mime ?? '') ? '.pdf' : /png/.test(mime ?? '') ? '.png' : /xml/.test(mime ?? '') ? '.xml' : '.jpg';
    const nome = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    writeFileSync(join(pasta, nome), Buffer.from(buffer));
    return `/uploads/bills/${nome}`;
}

// Limite simples de envios por link (por token, por hora).
export class LimiteEnvios {
    private mapa = new Map<string, number[]>();
    constructor(private readonly maxPorHora: number) { }
    contar(chave: string) {
        const agora = Date.now();
        const recentes = (this.mapa.get(chave) ?? []).filter((t) => agora - t < 3600_000);
        if (recentes.length >= this.maxPorHora) throw new BadRequestException('Muitos envios em pouco tempo. Tente mais tarde.');
        recentes.push(agora);
        this.mapa.set(chave, recentes);
    }
}

export async function lerPdf(buffer: Buffer): Promise<string> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse/lib/pdf-parse.js');
        const r = await pdfParse(buffer);
        return String(r.text ?? '');
    } catch {
        return '';
    }
}
