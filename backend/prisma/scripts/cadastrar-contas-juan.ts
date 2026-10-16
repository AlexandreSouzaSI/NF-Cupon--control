import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Cadastra as contas recorrentes da planilha "Contas a Pagar JUAN E IMPERIO"
// (abas "JUAN 09-26" e "IMPERIO 09-26") na loja física do Juan Carlos.
//
// - Por padrão roda em SIMULAÇÃO: só mostra o que já existe e o que seria criado.
// - Com --apply grava de verdade (recorrência mensal + 12 meses de contas).
// - Idempotente: conta que já existe (recorrência ou conta avulsa com mesmo
//   nome e mesmo dia) é pulada, então pode rodar de novo sem duplicar.
//
// Uso (dentro de backend/):
//   npx ts-node prisma/scripts/cadastrar-contas-juan.ts            (simulação)
//   npx ts-node prisma/scripts/cadastrar-contas-juan.ts --apply    (grava)

const APPLY = process.argv.includes('--apply');
const OWNER_EMAIL = 'alemourasouza33@gmail.com';
const MESES_GERACAO = 12;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';
type Kind = 'BOLETO' | 'PIX' | 'CARD';

type Item = {
    description: string;
    value: number;
    day: number; // dia do mês do vencimento (1-30)
    kind: Kind;
    pixKey?: string;
    pixKeyType?: PixKeyType;
    notes?: string;
    // Parcelamento com fim definido: cria contas avulsas (sem recorrência).
    fixedDueDates?: string[]; // 'YYYY-MM-DD'
};

const JUAN: Item[] = [
    { description: 'Cartão Nanquim/Bradesco', value: 84.9, day: 1, kind: 'CARD' },
    { description: 'Ana Paula Patrícia - Faxina / Escola Miguel', value: 5500, day: 5, kind: 'PIX', notes: 'Mandar para Ana Paula 31.98541-1635' },
    { description: 'Bernardo - filho (pensão)', value: 500, day: 5, kind: 'PIX', notes: 'R$ 500 junto à pensão, todo 5º dia útil. 31993533019 Bernardo Alves' },
    { description: 'Escola Bernardo', value: 1494, day: 5, kind: 'BOLETO' },
    { description: 'Investimento pessoal do Juan - empréstimo', value: 25000, day: 7, kind: 'PIX', pixKey: '296a0e60-6ede-4733-87e7-9587346b8f9e', pixKeyType: 'RANDOM', notes: 'Lançar como despesa' },
    { description: 'Tx Condomínio', value: 561.72, day: 10, kind: 'BOLETO' },
    { description: 'Cartão Santander Unlimited 4359 - Pessoal do Juan', value: 870.16, day: 10, kind: 'CARD' },
    { description: 'Cartão Sicred (final 1119)', value: 5526.75, day: 10, kind: 'CARD', notes: 'Pedir boleto ao Juan' },
    { description: 'Plano de Saúde Lucia (Med Senior)', value: 630.52, day: 10, kind: 'BOLETO' },
    { description: 'Plano de Saúde (Juan, Miguel)', value: 380.09, day: 10, kind: 'BOLETO', notes: 'Pedir à Ana (esposa) para enviar o boleto' },
    { description: 'Consórcio CAOA', value: 1904.32, day: 10, kind: 'BOLETO' },
    { description: 'Futebol do Bê', value: 210.24, day: 10, kind: 'BOLETO' },
    { description: 'IPTU Estância dos Lagos', value: 977.87, day: 10, kind: 'BOLETO', notes: 'Índice cadastral 1010720051000. Pegar e-mail do Juan Carlos' },
    { description: 'Pensão Ana', value: 1760, day: 15, kind: 'PIX', notes: 'Em torno de 1.760,00 - confirmar valor com a Ana e o Juan' },
    { description: 'Cartão Sicoob (dia 3)', value: 25, day: 3, kind: 'CARD', notes: 'Passou para o Juan em 06/2026. Chega por e-mail' },
    { description: 'Certificado digital - Rodrigo', value: 149, day: 3, kind: 'BOLETO' },
    { description: 'Cartão Itaú 2141', value: 4243.25, day: 17, kind: 'CARD' },
    { description: 'Aluguel da casa do Juan', value: 11000, day: 20, kind: 'PIX', pixKey: '31988075422', pixKeyType: 'PHONE', notes: 'Beneficiário: Roberto Vinicius da Silveira' },
    { description: 'Consórcio Roma - Holding', value: 2401.18, day: 20, kind: 'BOLETO', notes: 'Pagar pelo portal do consórcio (link enviado pelo Juan)' },
    { description: 'Cartão American Express', value: 1954.92, day: 20, kind: 'CARD', notes: 'Passou para o Juan em 06/2026' },
    { description: 'Condomínio', value: 745, day: 20, kind: 'BOLETO' },
    { description: 'Negociação ICMS', value: 1868.85, day: 21, kind: 'BOLETO' },
    { description: 'Parcela carro Marco Antonio (36x) - Holding', value: 3925.12, day: 22, kind: 'BOLETO', notes: '36 parcelas, a partir de 22/11. Carro (Marco Antonio)' },
    { description: 'Cartão Caixa Ícone 2569', value: 3309.19, day: 25, kind: 'CARD' },
    { description: 'Consórcios - Holding #1', value: 2829.6, day: 25, kind: 'BOLETO', notes: 'Mandar o total de 12.576,00 para a conta do Juan (pix CPF)' },
    { description: 'Consórcios - Holding #2', value: 4716, day: 25, kind: 'BOLETO' },
    { description: 'Consórcios - Holding #3', value: 5030.4, day: 25, kind: 'BOLETO' },
    { description: 'Parcela do Lote - Holding', value: 25000, day: 25, kind: 'BOLETO', notes: 'Solicitar boleto de 25 mil' },
    { description: 'Cartão Sicoob (dia 25)', value: 1965.23, day: 25, kind: 'CARD', notes: 'Passou para o Juan em 06/2026' },
    { description: 'Igor Piscina', value: 405, day: 30, kind: 'PIX', pixKey: '26.249.795/0001-60', pixKeyType: 'CNPJ' },
    { description: 'Taxa de condomínio', value: 887.63, day: 30, kind: 'BOLETO', notes: 'Planilha tem vencimento "31" - cadastrado no último dia do mês' },
    { description: 'Copasa', value: 470.23, day: 15, kind: 'BOLETO' },
    { description: 'CEMIG', value: 1320.19, day: 11, kind: 'BOLETO' },
    // 12 prestações de 2.750 (25/03/2026 a 25/03/2027): só as que faltam, sem recorrência.
    {
        description: 'Prestação pessoal do Juan (12x de 2.750)',
        value: 2750,
        day: 25,
        kind: 'BOLETO',
        notes: '12 prestações: início 25/03/2026, término 25/03/2027',
        fixedDueDates: ['2026-10-25', '2026-11-25', '2026-12-25', '2027-01-25', '2027-02-25', '2027-03-25'],
    },
];

const IMPERIO: Item[] = [
    { description: 'Império - Pagamento Leticia', value: 700, day: 6, kind: 'PIX' },
    { description: 'Império - JRT Marketing LTDA', value: 2000, day: 7, kind: 'PIX', pixKey: '55.792.596/0001-00', pixKeyType: 'CNPJ' },
    { description: 'Império - Adna Contabilidade', value: 547.8, day: 7, kind: 'BOLETO' },
    { description: 'Império - Facebook Serviços Online', value: 2300, day: 8, kind: 'CARD' },
    { description: 'Pagamento Kenlo - Império', value: 307, day: 17, kind: 'BOLETO', notes: 'Chega no e-mail do Juan' },
];

const SKIPPED = [
    'Consórcios (para o Marco) - sem valor nem vencimento na planilha',
    'Consórcios Marcos (app CAOA) - sem valor na planilha',
    'Sônia Aparecida C. Padilha (R$ 1.125) - planilha diz "próximo dia 12 somente" (pontual, não recorrente)',
    'Negociação ICMS 1/59 (R$ 547,12) - sem data de vencimento na planilha',
];

function norm(s: string) {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function brl(n: number) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ultimoDia(ano: number, mesIndex: number) {
    return new Date(ano, mesIndex + 1, 0).getDate();
}

function utcNoon(y: number, m: number, d: number) {
    return new Date(Date.UTC(y, m, d, 12, 0, 0));
}

function vencimentosMensais(day: number, hoje: Date, limite: Date) {
    const out: Date[] = [];
    const cursor = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    while (cursor <= limite) {
        const d = Math.min(day, ultimoDia(cursor.getFullYear(), cursor.getMonth()));
        const v = utcNoon(cursor.getFullYear(), cursor.getMonth(), d);
        if (v >= hoje) out.push(v);
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return out;
}

const TYPE_BY_KIND: Record<Kind, { type: any; paymentMethod: any }> = {
    BOLETO: { type: 'BOLETO', paymentMethod: 'BANK_SLIP' },
    PIX: { type: 'PIX', paymentMethod: 'PIX' },
    CARD: { type: 'CARD', paymentMethod: 'CREDIT_CARD' },
};

async function main() {
    console.log(APPLY ? '*** MODO GRAVAÇÃO (--apply) ***\n' : '*** SIMULAÇÃO (nada será gravado; use --apply para gravar) ***\n');

    const stores = await prisma.store.findMany({
        where: { tipoPessoa: 'FISICA' },
        select: { id: true, name: true },
    });
    const juanStores = stores.filter((s) => norm(s.name).includes('juan'));

    if (juanStores.length !== 1) {
        console.log('Não achei UMA loja física com "Juan" no nome. Lojas físicas encontradas:');
        stores.forEach((s) => console.log(` - ${s.name} (${s.id})`));
        process.exit(1);
    }

    const store = juanStores[0];
    console.log(`Loja: ${store.name}\n`);

    const owner = await prisma.user.findFirst({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner) {
        console.log(`Usuário ${OWNER_EMAIL} não encontrado (usado como "lançado por").`);
        process.exit(1);
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje);
    limite.setMonth(limite.getMonth() + MESES_GERACAO);

    const recorrencias = await prisma.billRecorrencia.findMany({
        where: { storeId: store.id, active: true },
        select: { id: true, description: true, dayOfMonth: true, value: true },
    });
    const avulsas = await prisma.bill.findMany({
        where: { storeId: store.id, status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { gte: hoje } },
        select: { description: true, dueDate: true, recorrenciaId: true },
    });

    console.log(`Já cadastradas na loja: ${recorrencias.length} recorrência(s) ativa(s), ${avulsas.length} conta(s) em aberto futuras.\n`);

    const todos = [...JUAN.map((i) => ({ ...i, aba: 'JUAN' })), ...IMPERIO.map((i) => ({ ...i, aba: 'IMPÉRIO' }))];
    let criadas = 0;
    let existentes = 0;

    for (const item of todos) {
        const n = norm(item.description);

        const rec = recorrencias.find((r) => {
            const rn = norm(r.description);
            return rn === n || ((rn.includes(n) || n.includes(rn)) && r.dayOfMonth === item.day);
        });

        const avulsa = !rec
            ? avulsas.find((b) => {
                const bn = norm(b.description);
                return bn === n || ((bn.includes(n) || n.includes(bn)) && b.dueDate.getUTCDate() === item.day);
            })
            : undefined;

        const label = `[${item.aba}] ${item.description} - ${brl(item.value)} - dia ${item.day}`;

        if (rec || avulsa) {
            existentes++;
            console.log(`JÁ EXISTE  ${label}  (${rec ? `recorrência "${rec.description}"` : `conta "${avulsa!.description}"`})`);
            continue;
        }

        console.log(`${APPLY ? 'CRIANDO  ' : 'CRIARIA  '}  ${label}${item.fixedDueDates ? `  [${item.fixedDueDates.length} parcelas avulsas]` : '  [recorrência mensal 12 meses]'}`);
        criadas++;

        if (!APPLY) continue;

        const { type, paymentMethod } = TYPE_BY_KIND[item.kind];
        const pix = item.pixKey ? { pixKey: item.pixKey, pixKeyType: item.pixKeyType as any } : {};

        if (item.fixedDueDates) {
            for (const d of item.fixedDueDates) {
                const [y, m, dd] = d.split('-').map(Number);
                const due = utcNoon(y, m - 1, dd);
                await prisma.bill.create({
                    data: {
                        description: item.description,
                        value: item.value,
                        type,
                        paymentMethod,
                        dueDate: due,
                        status: due >= hoje ? 'OPEN' : 'OVERDUE',
                        storeId: store.id,
                        launchedById: owner.id,
                        notes: item.notes,
                        ...pix,
                    },
                });
            }
            continue;
        }

        const recorrencia = await prisma.billRecorrencia.create({
            data: {
                description: item.description,
                value: item.value,
                recurrence: 'MONTHLY',
                dayOfMonth: item.day,
                type,
                paymentMethod,
                storeId: store.id,
                createdById: owner.id,
                generatedUntil: limite,
            },
        });

        for (const due of vencimentosMensais(item.day, hoje, limite)) {
            try {
                await prisma.bill.create({
                    data: {
                        description: item.description,
                        value: item.value,
                        type,
                        paymentMethod,
                        dueDate: due,
                        status: 'OPEN',
                        storeId: store.id,
                        launchedById: owner.id,
                        recorrenciaId: recorrencia.id,
                        notes: item.notes,
                        ...pix,
                    },
                });
            } catch {
                // já existe ocorrência nessa data (@@unique) - ignora
            }
        }
    }

    console.log(`\nResumo: ${criadas} ${APPLY ? 'criada(s)' : 'a criar'}, ${existentes} já existia(m).`);
    console.log('\nNão cadastradas (revisar com o Juan):');
    SKIPPED.forEach((s) => console.log(` - ${s}`));

    if (!APPLY) console.log('\nTudo certo? Rode de novo com --apply para gravar.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
