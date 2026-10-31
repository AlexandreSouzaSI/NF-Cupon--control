// =============================================================================
// Cliente mínimo da API do Omie (https://developer.omie.com.br/service-list/).
//
// Todas as chamadas são POST em https://app.omie.com.br/api/v1/<caminho>/ com
// { call, app_key, app_secret, param: [ {...} ] }. Erro vem como HTTP 500
// com { faultstring, faultcode }. Cada bar (CNPJ) tem o seu par App Key /
// App Secret.
// =============================================================================

export const OMIE_BASE_URL = process.env.OMIE_API_URL || 'https://app.omie.com.br/api/v1';

export class OmieErro extends Error {
    constructor(message: string, readonly faultcode?: string, readonly status?: number) {
        super(message);
    }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// "Não existem registros para a página [1]!" = lista vazia, não é erro.
export function semRegistros(erro: unknown) {
    return erro instanceof OmieErro && /n[aã]o existem registros/i.test(erro.message);
}

export class OmieApi {
    constructor(private readonly appKey: string, private readonly appSecret: string) { }

    async chamar<T = any>(caminho: string, call: string, param: Record<string, unknown>): Promise<T> {
        let tentativa = 0;
        for (; ;) {
            tentativa++;
            let resposta: Response;
            try {
                resposta = await fetch(`${OMIE_BASE_URL}/${caminho.replace(/^\/|\/$/g, '')}/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ call, app_key: this.appKey, app_secret: this.appSecret, param: [param] }),
                    signal: AbortSignal.timeout(90_000),
                });
            } catch (e: any) {
                if (tentativa < 3) { await esperar(3000 * tentativa); continue; }
                throw new OmieErro(`Não consegui falar com o Omie (${call}): ${e?.message ?? e}`);
            }
            const texto = await resposta.text();
            let corpo: any = null;
            try { corpo = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }

            if (resposta.ok && corpo && !corpo.faultstring) return corpo as T;

            const msg = String(corpo?.faultstring || corpo?.message || texto || `HTTP ${resposta.status}`).slice(0, 500);
            // Limite de consumo do Omie: espera e tenta de novo.
            const limite = resposta.status === 425 || resposta.status === 429 || /consumo|bloquead|limite|aguarde|too many/i.test(msg);
            const instavel = resposta.status >= 502 || /timeout|tempo limite|indispon/i.test(msg);
            if ((limite || instavel) && tentativa < 4 && !/n[aã]o existem registros/i.test(msg)) {
                await esperar(limite ? 15_000 * tentativa : 4000 * tentativa);
                continue;
            }
            throw new OmieErro(msg, corpo?.faultcode, resposta.status);
        }
    }

    // Busca todas as páginas de uma listagem.
    async todasAsPaginas<T = any>(
        caminho: string,
        call: string,
        param: Record<string, unknown>,
        lerPagina: (corpo: any) => { itens: T[]; totalPaginas: number },
        paginacao: { pagina: string; porPagina: string; tamanho: number } = { pagina: 'pagina', porPagina: 'registros_por_pagina', tamanho: 500 },
        aoAvancar?: (pagina: number, total: number) => void,
    ): Promise<T[]> {
        const todos: T[] = [];
        let pagina = 1;
        let total = 1;
        do {
            let corpo: any;
            try {
                corpo = await this.chamar(caminho, call, { ...param, [paginacao.pagina]: pagina, [paginacao.porPagina]: paginacao.tamanho });
            } catch (e) {
                if (semRegistros(e)) break;
                throw e;
            }
            const { itens, totalPaginas } = lerPagina(corpo);
            todos.push(...(itens ?? []));
            total = Math.max(1, Number(totalPaginas) || 1);
            aoAvancar?.(pagina, total);
            pagina++;
            if (pagina <= total) await esperar(400);
        } while (pagina <= total);
        return todos;
    }
}
