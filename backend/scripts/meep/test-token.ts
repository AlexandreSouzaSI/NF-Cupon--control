/**
 * Script standalone pra testar a integração com a API Meep sem precisar do
 * Postman — gera o token (POST /token/v1/Generate) e, se um MEEP_STORE_ID
 * estiver configurado, já testa uma chamada real (GetSimpleSales) pra
 * confirmar que a subscription key + login + storeId realmente funcionam
 * juntos.
 *
 * Como rodar:
 *   1. Copie scripts/meep/.env.meep.example pra scripts/meep/.env.meep e
 *      preencha com os seus dados (veja o PDF "Geração do Token - API Meep").
 *   2. cd backend
 *   3. npx ts-node scripts/meep/test-token.ts
 *
 * Não depende de nenhum pacote novo (usa fetch nativo do Node 18+) nem toca
 * no banco — é só pra validar as credenciais antes de configurarmos o
 * cadastro de verdade no sistema.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Loader bem simples de .env, só pra esse script (não usa dotenv de
// propósito, pra não precisar instalar nada só pra um teste pontual).
function loadEnvFile(path: string): Record<string, string> {
    if (!existsSync(path)) return {};

    const content = readFileSync(path, 'utf-8');
    const result: Record<string, string> = {};

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) continue;

        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();

        // Remove aspas simples/duplas envolvendo o valor, se houver.
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        result[key] = value;
    }

    return result;
}

const envFromFile = loadEnvFile(join(__dirname, '.env.meep'));

function getEnv(key: string): string | undefined {
    return process.env[key] || envFromFile[key];
}

const SUBSCRIPTION_KEY = getEnv('MEEP_SUBSCRIPTION_KEY');
const USERNAME = getEnv('MEEP_USERNAME');
const PASSWORD = getEnv('MEEP_PASSWORD');
const STORE_ID = getEnv('MEEP_STORE_ID');

const TOKEN_URL = 'https://meep-management.azure-api.net/token/v1/Generate';
const SIMPLE_SALES_URL =
    'https://meep-management.azure-api.net/third/sales/v1/GetSimpleSales';

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

async function generateToken(): Promise<string> {
    if (!SUBSCRIPTION_KEY) {
        throw new Error(
            'MEEP_SUBSCRIPTION_KEY não informado. Preencha o scripts/meep/.env.meep (veja .env.meep.example).',
        );
    }

    if (!USERNAME || !PASSWORD) {
        throw new Error(
            'MEEP_USERNAME/MEEP_PASSWORD não informados — são o login e a senha do portal https://portal.meep-app.com/ (não é o e-mail do Developer Portal).',
        );
    }

    const body = new URLSearchParams({
        grant_type: 'password',
        username: USERNAME,
        password: PASSWORD,
    });

    console.log('→ Gerando token em', TOKEN_URL, '...');

    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Falha ao gerar token (HTTP ${response.status}): ${text}`,
        );
    }

    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(`Resposta inesperada ao gerar token: ${text}`);
    }

    if (!parsed.access_token) {
        throw new Error(
            `Resposta não trouxe access_token: ${JSON.stringify(parsed)}`,
        );
    }

    console.log('✔ Token gerado com sucesso.');
    console.log(
        '  access_token (primeiros 20 caracteres):',
        String(parsed.access_token).slice(0, 20) + '...',
    );

    if (parsed.expires_in) {
        console.log('  expira em (segundos):', parsed.expires_in);
    }

    return parsed.access_token;
}

async function testSimpleSales(token: string) {
    if (!STORE_ID) {
        console.log(
            '\n(i) MEEP_STORE_ID não informado — pulando o teste de GetSimpleSales. Só o token já confirma que a subscription key + login/senha estão certos.',
        );
        return;
    }

    // Restrição da Meep: intervalo máximo de 3 dias por chamada.
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 1);

    const url = new URL(SIMPLE_SALES_URL);
    url.searchParams.set('StoreId', STORE_ID);
    url.searchParams.set('Start', formatDate(start));
    url.searchParams.set('End', formatDate(end));

    console.log('\n→ Testando GetSimpleSales em', url.toString(), '...');

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY as string,
        },
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Falha ao buscar vendas (HTTP ${response.status}): ${text}`,
        );
    }

    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(`Resposta inesperada de GetSimpleSales: ${text}`);
    }

    const totalOrders = parsed?.Orders?.length ?? 0;

    console.log('✔ GetSimpleSales respondeu OK.');
    console.log(`  Pedidos encontrados no período: ${totalOrders}`);
    console.log(`  NextPage: ${parsed?.NextPage}`);

    if (totalOrders > 0) {
        console.log('\n  Exemplo do primeiro pedido:');
        console.log(JSON.stringify(parsed.Orders[0], null, 2));
    }
}

async function main() {
    try {
        const token = await generateToken();
        await testSimpleSales(token);
        console.log('\nTudo certo — pode seguir pra configuração de verdade no sistema.');
    } catch (error: any) {
        console.error('\n✘ Erro:', error.message || error);
        process.exit(1);
    }
}

main();
