import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret } from '../stores/certificate-crypto.util';

// Cliente HTTP da API Meep (Sales API Third). Usa fetch nativo (sem
// dependência nova) — mesmo padrão já validado manualmente em
// scripts/meep/test-token.ts. Cada método aqui reflete uma rota
// documentada pela Meep, com as mesmas restrições de janela/paginação já
// levantadas na fase de configuração inicial (ver comentários por método).

const TOKEN_URL = 'https://meep-management.azure-api.net/token/v1/Generate';
const SALES_BASE_URL = 'https://meep-management.azure-api.net/third/sales/v1';

type CachedToken = {
    accessToken: string;
    expiresAt: number; // epoch ms
};

type ResolvedCredential = {
    subscriptionKey: string;
    username: string;
    password: string;
    meepStoreId: string;
};

export type MeepSimpleSalesResult = {
    orders: any[];
    nextPage: boolean | null;
    raw: any;
};

export type MeepSalesResult = {
    orders: any[];
    nextPage: boolean | null;
    raw: any;
};

export type MeepConciliationResult = {
    transactions: any[];
    raw: any;
};

@Injectable()
export class MeepClientService {
    // Cache em memória do processo — simples de propósito, cada loja tem
    // no máximo um token válido por vez e o processo do backend é único.
    // Se um dia rodar em cluster, isso só significa gerar token de novo
    // em cada instância (sem problema, a Meep permite).
    private tokenCache = new Map<string, CachedToken>();

    constructor(private prisma: PrismaService) { }

    private formatDate(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private assertMaxRangeDays(start: Date, end: Date, maxDays: number, routeName: string) {
        const diffMs = end.getTime() - start.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays > maxDays || diffDays < 0) {
            throw new BadRequestException(
                `${routeName}: intervalo inválido (máximo ${maxDays} dia(s) por chamada, recebido ${diffDays.toFixed(2)}).`,
            );
        }
    }

    private async resolveCredential(storeId: string): Promise<ResolvedCredential> {
        const credential = await this.prisma.meepCredential.findUnique({
            where: { storeId },
        });

        if (!credential) {
            throw new NotFoundException('Nenhuma credencial Meep cadastrada para essa loja.');
        }

        if (!credential.active) {
            throw new BadRequestException('Credencial Meep dessa loja está desativada.');
        }

        return {
            subscriptionKey: decryptSecret({
                cipher: credential.subscriptionKeyCipher,
                iv: credential.subscriptionKeyIv,
                authTag: credential.subscriptionKeyAuthTag,
            }),
            username: credential.username,
            password: decryptSecret({
                cipher: credential.passwordCipher,
                iv: credential.passwordIv,
                authTag: credential.passwordAuthTag,
            }),
            meepStoreId: credential.meepStoreId,
        };
    }

    // Gera (ou reaproveita, se ainda válido) o token de acesso dessa loja.
    // Um pouco de margem (60s) antes do expires_in real pra nunca usar um
    // token vencido por um triz no meio de uma chamada.
    private async getAccessToken(storeId: string, credential: ResolvedCredential): Promise<string> {
        const cached = this.tokenCache.get(storeId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.accessToken;
        }

        const body = new URLSearchParams({
            grant_type: 'password',
            username: credential.username,
            password: credential.password,
        });

        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': credential.subscriptionKey,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });

        const text = await response.text();

        if (!response.ok) {
            throw new Error(`Falha ao gerar token Meep (HTTP ${response.status}): ${text}`);
        }

        let parsed: any;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error(`Resposta inesperada ao gerar token Meep: ${text}`);
        }

        if (!parsed.access_token) {
            throw new Error(`Token Meep não veio na resposta: ${JSON.stringify(parsed)}`);
        }

        const expiresInSeconds = Number(parsed.expires_in) || 3600;
        const expiresAt = Date.now() + Math.max(expiresInSeconds - 60, 30) * 1000;

        this.tokenCache.set(storeId, { accessToken: parsed.access_token, expiresAt });

        return parsed.access_token;
    }

    private async authorizedGet(
        storeId: string,
        credential: ResolvedCredential,
        url: URL,
    ): Promise<any> {
        const token = await this.getAccessToken(storeId, credential);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                'Ocp-Apim-Subscription-Key': credential.subscriptionKey,
            },
        });

        const text = await response.text();

        if (!response.ok) {
            // Token pode ter sido revogado do lado da Meep — evita ficar
            // preso num token ruim até o cache expirar sozinho.
            if (response.status === 401) {
                this.tokenCache.delete(storeId);
            }

            throw new Error(`Meep respondeu HTTP ${response.status} em ${url.pathname}: ${text}`);
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`Resposta inesperada da Meep em ${url.pathname}: ${text}`);
        }
    }

    // Restrição documentada pela Meep: no máximo 3 dias por chamada, e é
    // monitorada por um "bot anti-abuso" — nunca chamar em loop apertado.
    async getSimpleSales(storeId: string, start: Date, end: Date, page = 1): Promise<MeepSimpleSalesResult> {
        this.assertMaxRangeDays(start, end, 3, 'GetSimpleSales');
        const credential = await this.resolveCredential(storeId);

        const url = new URL(`${SALES_BASE_URL}/GetSimpleSales`);
        url.searchParams.set('StoreId', credential.meepStoreId);
        url.searchParams.set('Start', this.formatDate(start));
        url.searchParams.set('End', this.formatDate(end));
        if (page > 1) url.searchParams.set('Page', String(page));

        const raw = await this.authorizedGet(storeId, credential, url);

        return {
            orders: raw?.Orders ?? [],
            nextPage: raw?.NextPage ?? null,
            raw,
        };
    }

    // Restrição documentada pela Meep: só pode ser chamada entre 04h e 14h
    // (horário deles), no máximo 3 dias por chamada, até 100 linhas por
    // página. É a única rota que traz CFOP/NCM.
    //
    // Achado na doc oficial (Swagger da Meep, confirmado pelo usuário) —
    // bem diferente do que o código assumia antes (por isso 404 sempre):
    //  - o caminho é "/Get", não "/GetSales";
    //  - Page e Count são OBRIGATÓRIOS (não só a partir da página 2);
    //  - a resposta é um ARRAY direto (não um objeto com campo "Orders");
    //  - "NextPage" vem em CADA pedido do array (não um campo único no
    //    topo) — o último pedido da página indica se tem próxima.
    // Pagina sozinho aqui dentro até NextPage vir false, então quem chama
    // (fetchOrdersInSubWindows) não precisa saber da paginação — só
    // recebe a lista completa da janela pedida.
    async getSales(storeId: string, start: Date, end: Date): Promise<MeepSalesResult> {
        this.assertMaxRangeDays(start, end, 3, 'GetSales');
        const credential = await this.resolveCredential(storeId);

        const allOrders: any[] = [];
        const count = 100;
        let page = 1;

        // Trava de segurança: numa janela de só 3 dias não deveria nunca
        // passar disso — existe só pra nunca ficar em loop infinito se a
        // Meep mandar NextPage=true indefinidamente por algum bug dela.
        const MAX_PAGES = 50;

        while (page <= MAX_PAGES) {
            const url = new URL(`${SALES_BASE_URL}/Get`);
            url.searchParams.set('StoreId', credential.meepStoreId);
            url.searchParams.set('Start', this.formatDate(start));
            url.searchParams.set('End', this.formatDate(end));
            url.searchParams.set('Page', String(page));
            url.searchParams.set('Count', String(count));

            const raw = await this.authorizedGet(storeId, credential, url);
            const pageOrders: any[] = Array.isArray(raw) ? raw : (raw?.Orders ?? []);

            allOrders.push(...pageOrders);

            const temProximaPagina =
                pageOrders.length > 0 && pageOrders[pageOrders.length - 1]?.NextPage === true;

            if (!temProximaPagina) break;

            page += 1;
            // Pausa entre páginas pelo mesmo motivo do resto do sync (bot
            // anti-abuso da Meep).
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        return {
            orders: allOrders,
            nextPage: false,
            raw: allOrders,
        };
    }

    // Formato exigido por essa rota específica: "YYYY-MM-DD HH:mm:ss.SSS"
    // (espaço, não "T", sem "Z" no fim) — confirmado na doc oficial. O
    // valor já deve estar em UTC (BRT + 3h), que é como os Date já
    // circulam internamente no sync.
    private formatConciliationDate(date: Date): string {
        return date.toISOString().replace('T', ' ').replace('Z', '');
    }

    // Restrição documentada pela Meep: no máximo 24h por chamada. Traz
    // valor bruto/taxa/líquido por transação — é a rota usada pra
    // conciliação de caixa (crédito/débito/dinheiro/outros). Path real
    // confirmado na doc: /third/sales/v1/transactions/conciliation (não
    // "/GetTransactionsForConciliation", que não existe e dá 404).
    async getTransactionsForConciliation(storeId: string, start: Date, end: Date): Promise<MeepConciliationResult> {
        this.assertMaxRangeDays(start, end, 1, 'GetTransactionsForConciliation');
        const credential = await this.resolveCredential(storeId);

        const url = new URL(`${SALES_BASE_URL}/transactions/conciliation`);
        url.searchParams.set('StoreId', credential.meepStoreId);
        url.searchParams.set('Start', this.formatConciliationDate(start));
        url.searchParams.set('End', this.formatConciliationDate(end));

        const raw = await this.authorizedGet(storeId, credential, url);

        return {
            transactions: Array.isArray(raw) ? raw : raw?.Transactions ?? [],
            raw,
        };
    }

    // Busca o XML completo da NFC-e por chave de acesso — usado quando
    // precisamos do detalhe fiscal exato que não vem nos campos já
    // tipados (ex: conferência de imposto item a item).
    async getXml(storeId: string, chaveAcesso: string): Promise<string> {
        const credential = await this.resolveCredential(storeId);

        const url = new URL(`${SALES_BASE_URL}/GetXML`);
        url.searchParams.set('StoreId', credential.meepStoreId);
        url.searchParams.set('ChaveAcesso', chaveAcesso);

        const token = await this.getAccessToken(storeId, credential);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                'Ocp-Apim-Subscription-Key': credential.subscriptionKey,
            },
        });

        const text = await response.text();

        if (!response.ok) {
            throw new Error(`Falha ao buscar XML Meep (HTTP ${response.status}): ${text}`);
        }

        return text;
    }
}
