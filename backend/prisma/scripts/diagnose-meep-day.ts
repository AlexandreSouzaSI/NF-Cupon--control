import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Só leitura: para UM dia comercial (08h-04h BRT) mostra, por loja, quanto
// vale o dia somando (a) o valor dos pedidos, (b) os itens e (c) os
// pagamentos — e procura pedidos "repetidos" (mesmo cliente, valor e
// horário com ids diferentes). Serve pra descobrir onde o dobro aparece.
//
// Uso (dentro de backend/):
//   npx ts-node prisma/scripts/diagnose-meep-day.ts 2026-10-12
//
// IMPORTANTE: usa o DATABASE_URL do .env — confira se é o banco que tem o
// problema (produção ou local).

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const brl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main() {
    const dia = process.argv[2];

    if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        console.error('Informe o dia: npx ts-node prisma/scripts/diagnose-meep-day.ts 2026-10-12');
        process.exit(1);
    }

    // Dia comercial: 08h BRT (11h UTC) até 04h BRT do dia seguinte (07h UTC).
    const inicio = new Date(`${dia}T11:00:00.000Z`);
    const fim = new Date(inicio.getTime() + 20 * 60 * 60 * 1000 - 1);

    const lojas = await prisma.store.findMany({
        where: { meepOrders: { some: { orderDateUtc: { gte: inicio, lte: fim } } } },
        select: { id: true, name: true },
    });

    if (lojas.length === 0) {
        console.log('Nenhuma loja com pedidos Meep nesse dia neste banco.');
        return;
    }

    for (const loja of lojas) {
        const orders = await prisma.meepOrder.findMany({
            where: { storeId: loja.id, orderDateUtc: { gte: inicio, lte: fim } },
            include: { items: true, payments: true },
        });

        let somaPedidos = 0;
        let somaItens = 0;
        let somaPagamentos = 0;
        let semPagamento = 0;
        let semItens = 0;
        const porRota: Record<string, number> = {};

        for (const o of orders) {
            somaPedidos += Number(o.value);
            porRota[o.lastSyncedFrom] = (porRota[o.lastSyncedFrom] || 0) + 1;
            if (o.payments.length === 0) semPagamento += 1;
            if (o.items.length === 0) semItens += 1;

            for (const p of o.payments) somaPagamentos += Number(p.value);
            for (const i of o.items) {
                somaItens += Number(i.total ?? Number(i.unitValue) * Number(i.quantity));
            }
        }

        // Pedidos "gêmeos": mesmo CONTEÚDO de itens (produto+qtd+total),
        // mesmo cliente e horário (±2 min) mas meepOrderId diferente. Não
        // usa o valor do pedido (vem 0 nos pedidos da rota GetSales).
        const assinatura = (o: (typeof orders)[number]) =>
            o.items
                .map((i) => `${i.productName}|${Number(i.quantity)}|${Number(i.total ?? Number(i.unitValue) * Number(i.quantity))}`)
                .sort()
                .join(';');

        const gemeos = new Set<string>();
        const ordenados = [...orders].sort(
            (a, b) => a.orderDateUtc.getTime() - b.orderDateUtc.getTime(),
        );
        for (let a = 0; a < ordenados.length; a++) {
            const x = ordenados[a];
            const sx = assinatura(x);
            for (let b = a + 1; b < ordenados.length; b++) {
                const y = ordenados[b];
                if (y.orderDateUtc.getTime() - x.orderDateUtc.getTime() > 120000) break;
                if (
                    sx.length > 0 &&
                    sx === assinatura(y) &&
                    (x.customerDocument || '') === (y.customerDocument || '') &&
                    (x.customerName || '') === (y.customerName || '')
                ) {
                    gemeos.add(x.id);
                    gemeos.add(y.id);
                }
            }
        }

        const itensSemId = orders.reduce(
            (sum, o) => sum + o.items.filter((i) => !i.meepItemId).length,
            0,
        );
        const totalItens = orders.reduce((sum, o) => sum + o.items.length, 0);
        console.log(`Itens sem Id da Meep: ${itensSemId} de ${totalItens}`);

        // Duplicação DENTRO do JSON da Meep: mesmo Id de item repetido no
        // array Itens do próprio pedido, ou item idêntico (produto, qtd,
        // valor) repetido em dobro.
        let pedidosJsonComIdRepetido = 0;
        let pedidosJsonTudoEmDobro = 0;
        for (const o of orders) {
            const raw: any[] = Array.isArray((o.rawJson as any)?.Itens)
                ? (o.rawJson as any).Itens
                : [];
            const ids = raw.map((i) => i.Id).filter(Boolean);
            if (ids.length !== new Set(ids).size) pedidosJsonComIdRepetido += 1;

            // Metade do array == outra metade (cópia exata em dobro)
            if (raw.length > 0 && raw.length % 2 === 0) {
                const metade = raw.length / 2;
                const a = JSON.stringify(raw.slice(0, metade));
                const b = JSON.stringify(raw.slice(metade));
                if (a === b) pedidosJsonTudoEmDobro += 1;
            }
        }

        // Mesmo meepItemId aparecendo em MAIS DE UM pedido do dia.
        const idEmPedidos = new Map<string, Set<string>>();
        for (const o of orders) {
            for (const i of o.items) {
                if (!i.meepItemId) continue;
                if (!idEmPedidos.has(i.meepItemId)) idEmPedidos.set(i.meepItemId, new Set());
                idEmPedidos.get(i.meepItemId)!.add(o.id);
            }
        }
        const itensEmVariosPedidos = [...idEmPedidos.values()].filter((s) => s.size > 1).length;

        console.log(`\n=== ${loja.name} — ${dia} ===`);
        console.log(`JSON da Meep: pedidos com Id de item repetido: ${pedidosJsonComIdRepetido}`);
        console.log(`JSON da Meep: pedidos com Itens copiados em dobro: ${pedidosJsonTudoEmDobro}`);
        console.log(`Mesmo item (Id) em mais de um pedido: ${itensEmVariosPedidos}`);
        console.log(`Pedidos: ${orders.length}  (por rota: ${JSON.stringify(porRota)})`);
        console.log(`Soma do valor dos pedidos : ${brl(somaPedidos)}`);
        console.log(`Soma dos itens            : ${brl(somaItens)}`);
        console.log(`Soma dos pagamentos       : ${brl(somaPagamentos)}`);
        console.log(`Pedidos sem pagamento     : ${semPagamento}`);
        console.log(`Pedidos sem itens         : ${semItens}`);
        console.log(`Pedidos possivelmente repetidos (mesmo valor/cliente/horário): ${gemeos.size}`);

        // Quadro por tipo/status/rota: mostra QUAL grupo de pedidos carrega
        // o valor "a mais" (ex: um tipo de pedido que só repete o consumo).
        const grupos = new Map<
            string,
            { pedidos: number; valor: number; itens: number; pagamentos: number }
        >();
        for (const o of orders) {
            const chave = `tipo=${o.orderType ?? '-'} | status=${o.statusCode ?? '-'}/${o.status ?? '-'} | rota=${o.lastSyncedFrom}`;
            const g = grupos.get(chave) || { pedidos: 0, valor: 0, itens: 0, pagamentos: 0 };
            g.pedidos += 1;
            g.valor += Number(o.value);
            for (const i of o.items) {
                g.itens += Number(i.total ?? Number(i.unitValue) * Number(i.quantity));
            }
            for (const p of o.payments) g.pagamentos += Number(p.value);
            grupos.set(chave, g);
        }
        console.log('\nPor tipo / status / rota:');
        for (const [chave, g] of [...grupos.entries()].sort((a, b) => b[1].itens - a[1].itens)) {
            console.log(
                `  ${chave}\n    pedidos=${g.pedidos}  valorPedidos=${brl(g.valor)}  itens=${brl(g.itens)}  pagamentos=${brl(g.pagamentos)}`,
            );
        }

        // Por comanda (AccountId): quantos pedidos, quanto de itens e quanto
        // de pagamento. Se cada pedido da comanda traz os itens da comanda
        // INTEIRA (acumulado), a soma dos itens vira N× o pagamento.
        const porConta = new Map<
            string,
            { pedidos: typeof orders; itens: number; pagamentos: number }
        >();
        for (const o of orders) {
            const k = o.meepAccountId ?? `sem-conta:${o.meepOrderId}`;
            const g = porConta.get(k) || { pedidos: [] as typeof orders, itens: 0, pagamentos: 0 };
            g.pedidos.push(o);
            for (const i of o.items) {
                g.itens += Number(i.total ?? Number(i.unitValue) * Number(i.quantity));
            }
            for (const p of o.payments) g.pagamentos += Number(p.value);
            porConta.set(k, g);
        }
        const contasComPagto = [...porConta.entries()].filter(([, g]) => g.pagamentos > 0);
        const contasSemPagto = [...porConta.entries()].filter(([, g]) => g.pagamentos === 0);
        console.log(
            `\nComandas (AccountId): ${porConta.size} | com pagamento: ${contasComPagto.length} | sem pagamento: ${contasSemPagto.length}`,
        );
        console.log(
            `  itens das comandas COM pagamento : ${brl(contasComPagto.reduce((s, [, g]) => s + g.itens, 0))}  (pagamentos: ${brl(contasComPagto.reduce((s, [, g]) => s + g.pagamentos, 0))})`,
        );
        console.log(
            `  itens das comandas SEM pagamento : ${brl(contasSemPagto.reduce((s, [, g]) => s + g.itens, 0))}`,
        );
        const pedidosPorConta = [...porConta.values()].map((g) => g.pedidos.length);
        console.log(
            `  pedidos por comanda: máx=${Math.max(...pedidosPorConta)} | comandas com >1 pedido=${pedidosPorConta.filter((n) => n > 1).length}`,
        );

        // Uma comanda com pagamento e vários pedidos, em detalhe.
        const exemplo = contasComPagto
            .filter(([, g]) => g.pedidos.length > 1)
            .sort((a, b) => b[1].pedidos.length - a[1].pedidos.length)[0];
        if (exemplo) {
            const [k, g] = exemplo;
            console.log(
                `\nExemplo de comanda ${k}: ${g.pedidos.length} pedidos, itens=${brl(g.itens)}, pagamentos=${brl(g.pagamentos)}`,
            );
            const ordenadosConta = [...g.pedidos].sort(
                (a, b) => a.orderDateUtc.getTime() - b.orderDateUtc.getTime(),
            );
            const contagem = new Map<string, number>();
            for (const p of ordenadosConta) {
                const r: any = p.rawJson ?? {};
                console.log(
                    `  - ${p.orderDateUtc.toISOString()} ${p.meepOrderId.slice(0, 8)} OrderType=${r.OrderType} Status=${r.Status}/${r.StatusName ?? '-'} Number=${r.Number ?? '-'} POS=${r.POS?.Code ?? '-'} itens=${p.items.length} pagtos=${p.payments.length}`,
                );
                for (const i of p.items) {
                    const v = Number(i.total ?? Number(i.unitValue) * Number(i.quantity));
                    console.log(`      · ${i.productName} x${Number(i.quantity)} = ${brl(v)}`);
                    const sig = `${i.productName} x${Number(i.quantity)} = ${brl(v)}`;
                    contagem.set(sig, (contagem.get(sig) || 0) + 1);
                }
            }
            console.log('  Itens por assinatura (produto/qtd/valor) → vezes que aparece na comanda:');
            for (const [sig, n] of [...contagem.entries()].sort((a, b) => b[1] - a[1])) {
                console.log(`      ${n}x  ${sig}`);
            }
        }

        // Proporção itens/pagamento por comanda paga (histograma).
        const faixas = new Map<string, number>();
        for (const [, g] of contasComPagto) {
            const r = g.itens / g.pagamentos;
            const faixa = r < 0.9 ? '<0,9' : r <= 1.1 ? '≈1×' : r <= 1.9 ? '1,1–1,9×' : r <= 2.1 ? '≈2×' : '>2,1×';
            faixas.set(faixa, (faixas.get(faixa) || 0) + 1);
        }
        console.log(`\nComandas pagas por proporção itens/pagamento: ${JSON.stringify(Object.fromEntries(faixas))}`);

        // Amostra do JSON (sem Itens/Payments) de 2 pedidos sem pagamento.
        console.log('\nAmostra de pedidos SEM pagamento (campos do JSON):');
        for (const p of orders.filter((o) => o.payments.length === 0).slice(0, 2)) {
            const { Itens, Payments, ...resto } = (p.rawJson as any) ?? {};
            console.log(`  ${p.meepOrderId}: ${JSON.stringify(resto).slice(0, 800)}`);
        }

        // Os 3 maiores pedidos do dia, com o que tem dentro (pra olhar a
        // olho nu se o item aparece repetido).
        const maiores = [...orders].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 3);
        console.log('\nTop 3 pedidos do dia:');
        for (const o of maiores) {
            console.log(
                `  #${o.meepOrderId} valor=${brl(Number(o.value))} itens=${o.items.length} pagamentos=${o.payments.length} tipo=${o.orderType ?? '-'} status=${o.status ?? o.statusCode ?? '-'}`,
            );
            for (const i of o.items.slice(0, 6)) {
                console.log(`      - ${i.productName} x${Number(i.quantity)} = ${brl(Number(i.total ?? Number(i.unitValue) * Number(i.quantity)))} (id=${i.meepItemId ?? 'sem-id'})`);
            }
        }
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
