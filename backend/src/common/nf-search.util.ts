import { PrismaService } from '../../prisma/prisma.service';

// Busca única (número OU nome OU valor) usada pelas três listas de Notas
// Fiscais: Entrada (IncomingGoodsNf), Saída (OutgoingSalesNf) e Serviço
// (IncomingServiceNf).
//
// Entrada e Saída não têm coluna "número da NF": o número (nNF) vai dentro
// da chave de acesso de 44 dígitos — cUF(2) AAMM(4) CNPJ(14) mod(2)
// serie(3) nNF(9) tpEmis(1) cNF(8) DV(1) —, ou seja, posições 26 a 34
// (1-based). Derivar da chave evita migração + backfill. Serviço (NFS-e)
// já tem `numeroNf` gravado.

export type NfSearch = {
    text: string;
    // só dígitos do que foi digitado (CNPJ/CPF e valor)
    digits: string;
    // `digits` sem zeros à esquerda — é o que se compara com o nNF
    numberDigits: string;
    // valor em reais se o texto parece um valor ("1.234,56", "1234.5")
    valueNumber: number | null;
};

export function parseNfSearch(raw?: string | null): NfSearch | null {
    const text = (raw ?? '').trim();
    if (!text) return null;

    const digits = text.replace(/\D/g, '');
    const numberDigits = digits.replace(/^0+/, '');

    let valueNumber: number | null = null;
    const cleaned = text.replace(/R\$\s*/i, '').trim();

    if (/^[\d.,]+$/.test(cleaned) && /\d/.test(cleaned)) {
        let normalized = cleaned;

        if (cleaned.includes(',')) {
            // 1.234,56 -> 1234.56
            normalized = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
            // 1.234 (ponto de milhar, sem centavos) -> 1234
            normalized = cleaned.replace(/\./g, '');
        }

        const parsed = Number(normalized);
        if (Number.isFinite(parsed)) {
            valueNumber = Math.round(parsed * 100) / 100;
        }
    }

    return { text, digits, numberDigits, valueNumber };
}

// Número da NF a partir da chave de 44 dígitos (sem zeros à esquerda).
export function numeroNfFromChave(chave?: string | null): string | null {
    if (!chave || !/^\d{44}$/.test(chave)) return null;

    const numero = chave.slice(25, 34).replace(/^0+/, '');
    return numero || '0';
}

// Ids das NFs (tabelas com chaveAcesso de NF-e/NFC-e) cujo número contém o
// que foi digitado. `storeIds` limita a busca (undefined = sem limite).
async function findIdsByNumeroNf(
    prisma: PrismaService,
    table: 'IncomingGoodsNf' | 'OutgoingSalesNf',
    numberDigits: string,
    storeIds?: string[],
): Promise<string[]> {
    if (!numberDigits) return [];

    // `table` é uma constante do tipo acima (nunca vem do usuário); os
    // valores digitados vão sempre como parâmetro ($1, $2).
    const params: unknown[] = [`%${numberDigits}%`];
    let storeClause = '';

    if (storeIds) {
        params.push(storeIds);
        storeClause = `AND "storeId" = ANY($2::text[])`;
    }

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "${table}"
         WHERE "chaveAcesso" ~ '^[0-9]{44}$'
           AND ltrim(substring("chaveAcesso" from 26 for 9), '0') LIKE $1
           ${storeClause}
         LIMIT 5000`,
        ...params,
    );

    return rows.map((row) => row.id);
}

// Cláusula OR (Prisma) para NF de Entrada/Saída. Devolve null quando não há
// busca. Casa por número (derivado da chave), nome, CNPJ/CPF e valor.
export async function buildChaveNfSearchOr(
    prisma: PrismaService,
    opts: {
        table: 'IncomingGoodsNf' | 'OutgoingSalesNf';
        search?: string | null;
        storeIds?: string[];
        nameField: string;
        docField: string;
    },
): Promise<Record<string, unknown>[] | null> {
    const parsed = parseNfSearch(opts.search);
    if (!parsed) return null;

    const or: Record<string, unknown>[] = [
        { [opts.nameField]: { contains: parsed.text, mode: 'insensitive' } },
    ];

    if (parsed.numberDigits) {
        const ids = await findIdsByNumeroNf(
            prisma,
            opts.table,
            parsed.numberDigits,
            opts.storeIds,
        );

        if (ids.length > 0) or.push({ id: { in: ids } });
    }

    if (parsed.digits.length >= 4) {
        or.push({ [opts.docField]: { contains: parsed.digits } });
    }

    if (parsed.valueNumber !== null) {
        or.push({ value: parsed.valueNumber });
    }

    return or;
}

// Cláusula OR (Prisma) para NFS-e (IncomingServiceNf), que tem numeroNf.
export function buildServiceNfSearchOr(
    search?: string | null,
): Record<string, unknown>[] | null {
    const parsed = parseNfSearch(search);
    if (!parsed) return null;

    const or: Record<string, unknown>[] = [
        { issuerName: { contains: parsed.text, mode: 'insensitive' } },
    ];

    if (parsed.numberDigits) {
        or.push({ numeroNf: { contains: parsed.numberDigits } });
    }

    if (parsed.digits.length >= 4) {
        or.push({ issuerDoc: { contains: parsed.digits } });
    }

    if (parsed.valueNumber !== null) {
        or.push({ value: parsed.valueNumber });
    }

    return or;
}
