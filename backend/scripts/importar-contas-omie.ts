/**
 * Importa as Contas a Pagar exportadas do Omie (relatório "Contas a Pagar"
 * salvo como HTML — o arquivo pivotgrid.html) para uma loja, APAGANDO antes
 * tudo que existe em Contas a Pagar dessa loja (contas abertas, pagas,
 * canceladas e as recorrências cadastradas).
 *
 * Por padrão só SIMULA (mostra o que vai fazer e não grava nada). Para
 * gravar de verdade, acrescente --aplicar.
 *
 * Como rodar (de dentro da pasta backend, com o .env apontando pro banco
 * certo — local ou VPS):
 *
 *   npx tsx scripts/importar-contas-omie.ts "C:\Users\alemo\Downloads\pivotgrid.html" Contagem
 *   npx tsx scripts/importar-contas-omie.ts "C:\Users\alemo\Downloads\pivotgrid.html" Contagem --aplicar
 *
 * Opções:
 *   2º argumento   trecho do nome da loja (ou o CNPJ / id da loja)
 *   --aplicar      grava (sem isso é só simulação)
 *   --usuario=x    e-mail de quem aparece como "lançado por" (padrão: o
 *                  Proprietário/Administrativo mais antigo da empresa)
 *
 * O que vira cada coluna do Omie:
 *   Razão Social + CNPJ/CPF → Fornecedor (acha pelo CNPJ ou pelo nome; cria se não existir)
 *   Categoria                → Categoria (casada com as categorias padrão; cria as que faltam)
 *   Vencimento               → Vencimento (vencida = status Vencida)
 *   A Pagar                  → Valor
 *   Documento / Conta Corrente → Tipo e forma de pagamento (Boleto, Caixinha = dinheiro...)
 *   Nota Fiscal, Parcela     → Descrição
 *   o resto (emissão, previsão, origem, conta corrente, impostos retidos...) → Observações
 * O arquivo do Omie não traz código de barras nem chave PIX.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { BillPaymentMethod, BillStatus, PayableType, PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--'));
const lojaArg = args.filter((a) => !a.startsWith('--'))[1];
const aplicar = args.includes('--aplicar');
const usuarioArg = args.find((a) => a.startsWith('--usuario='))?.split('=')[1];

if (!arquivo || !lojaArg) {
    console.log('Uso: npx tsx scripts/importar-contas-omie.ts <arquivo.html> <loja> [--aplicar] [--usuario=email]');
    process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// ----------------------------------------------------------------- helpers
const so = (t?: string | null) => String(t ?? '').replace(/\D/g, '');
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizar = (t: string) => semAcento(t).trim().replace(/\s+/g, ' ').toLowerCase();
const nd = (t?: string | null) => (!t || t === 'N/D' ? '' : t.trim());
const decodificar = (t: string) => t
    .replace(/<[^>]+>/g, '')
    .replace(/&sol;/g, '/').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
const dinheiro = (t: string) => {
    const s = String(t ?? '').replace(/R\$/g, '').replace(/\s/g, '').replace(/-/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const data = (t: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(nd(t));
    return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00.000Z`) : null;
};
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Categoria do Omie → [nome da nossa categoria, grupo se precisar criar]
const CATEGORIAS: Record<string, [string, string | null]> = {
    'compras de mercadorias para revenda': ['Mercadorias para revenda', 'REVENDA'],
    'compras de materia prima': ['Matéria-prima (compras)', 'MATERIA_PRIMA'],
    aluguel: ['Aluguel', 'DESPESAS_FIXAS'],
    'agua e esgoto': ['Água', 'DESPESAS_FIXAS'],
    'energia eletrica': ['Luz', 'DESPESAS_FIXAS'],
    telefonia: ['Telefone', 'DESPESAS_FIXAS'],
    seguros: ['Seguros', 'DESPESAS_FIXAS'],
    limpeza: ['Limpeza e dedetização', 'SERVICOS'],
    contabilidade: ['Contabilidade', 'SERVICOS'],
    'compra de servicos': ['Serviços contratados', 'SERVICOS'],
    'manutencao de imobilizado': ['Manutenção', 'SERVICOS'],
    veiculos: ['Veículos', 'SERVICOS'],
    'simples nacional (das)': ['Simples Nacional (DAS)', 'IMPOSTOS'],
    iptu: ['IPTU', 'IMPOSTOS'],
    icms: ['Impostos e guias', 'IMPOSTOS'],
    irpj: ['Impostos e guias', 'IMPOSTOS'],
    'contribuicao social': ['Impostos e guias', 'IMPOSTOS'],
    fgts: ['Impostos e guias', 'IMPOSTOS'],
    inss: ['Impostos e guias', 'IMPOSTOS'],
    salarios: ['Salários', 'FUNCIONARIOS'],
    adiantamento: ['Adiantamento salarial', 'FUNCIONARIOS'],
    rescisoes: ['Rescisões', 'FUNCIONARIOS'],
    'pensao alimenticia': ['Pensão alimentícia', 'FUNCIONARIOS'],
    'outros beneficios': ['Vale-transporte e benefícios', 'FUNCIONARIOS'],
    'cartao de credito': ['Cartão de crédito', null],
    'pagamento de emprestimos': ['Empréstimos', 'SOCIOS'],
};

type Linha = Record<string, string>;

function lerArquivo(caminho: string): Linha[] {
    const html = readFileSync(caminho, 'utf8');
    const linhas = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
        [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => decodificar(c[1])));
    const cab = linhas[0];
    if (!cab?.includes('Vencimento') || !cab.includes('Razão Social')) {
        throw new Error('Arquivo não parece o relatório "Contas a Pagar" do Omie (faltam as colunas Vencimento / Razão Social).');
    }
    return linhas.slice(1)
        .map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i] ?? ''])))
        .filter((l) => nd(l['Razão Social']) && data(l['Vencimento'])); // tira a linha de total
}

async function main() {
    const linhas = lerArquivo(arquivo!);
    const cnpjsArquivo = [...new Set(linhas.map((l) => so(l['Minha Empresa (CNPJ)'])).filter(Boolean))];

    // ------------------------------------------------------------- loja
    const lojas = await prisma.store.findMany({ select: { id: true, name: true, cnpj: true, empresaId: true } });
    const q = normalizar(lojaArg!);
    const achadas = lojas.filter((l) => l.id === lojaArg || (so(lojaArg) && so(l.cnpj) === so(lojaArg)) || normalizar(l.name).includes(q));
    if (achadas.length !== 1) {
        console.log(`Achei ${achadas.length} lojas para "${lojaArg}":`);
        (achadas.length ? achadas : lojas).forEach((l) => console.log(`  - ${l.name} (id ${l.id}, CNPJ ${l.cnpj ?? '-'})`));
        console.log('Use um trecho do nome que só bata em uma loja (ou o id).');
        process.exit(1);
    }
    const loja = achadas[0];
    if (loja.cnpj && cnpjsArquivo.length && !cnpjsArquivo.includes(so(loja.cnpj))) {
        console.log(`ATENÇÃO: o arquivo é do CNPJ ${cnpjsArquivo.join(', ')} e a loja ${loja.name} está com CNPJ ${loja.cnpj}. Confira se é a loja certa.`);
    }

    // ---------------------------------------------------------- usuário
    const usuario = usuarioArg
        ? await prisma.user.findFirst({ where: { email: usuarioArg }, select: { id: true, name: true, email: true } })
        : await prisma.user.findFirst({
            where: { empresaId: loja.empresaId, active: true, role: { in: ['PROPRIETARIO', 'ADMINISTRATIVO'] } },
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, email: true },
        });
    if (!usuario) {
        console.log('Não achei o usuário que vai aparecer como "lançado por". Use --usuario=email@...');
        process.exit(1);
    }

    // ------------------------------------------------- o que existe hoje
    const contasHoje = await prisma.bill.findMany({ where: { storeId: loja.id }, select: { id: true, status: true, value: true } });
    const recorrenciasHoje = await prisma.billRecorrencia.count({ where: { storeId: loja.id } });

    // ------------------------------------------------------- categorias
    const categoriasEmpresa = await prisma.billCategory.findMany({ where: { empresaId: loja.empresaId }, select: { id: true, name: true, nameNormalized: true } });
    const catPorNome = new Map(categoriasEmpresa.map((c) => [c.nameNormalized, c.id]));
    const destinoCategoria = (omie: string): [string, string | null] => {
        const k = normalizar(nd(omie));
        return CATEGORIAS[k] ?? [nd(omie) || 'Outros', null];
    };
    const categoriasNovas = new Map<string, { name: string; group: string | null }>();
    for (const l of linhas) {
        const [nome, grupo] = destinoCategoria(l['Categoria']);
        const n = normalizar(nome);
        if (!catPorNome.has(n) && !categoriasNovas.has(n)) categoriasNovas.set(n, { name: nome, group: grupo });
    }

    // ------------------------------------------------------ fornecedores
    const fornecedoresEmpresa = await prisma.supplier.findMany({ where: { empresaId: loja.empresaId }, select: { id: true, name: true, nameNormalized: true, cnpj: true } });
    const fornPorDoc = new Map(fornecedoresEmpresa.filter((f) => so(f.cnpj)).map((f) => [so(f.cnpj), f.id]));
    const fornPorNome = new Map(fornecedoresEmpresa.map((f) => [f.nameNormalized, f.id]));
    const fornecedoresNovos = new Map<string, { name: string; cnpj: string | null }>();
    const chaveFornecedor = (l: Linha) => {
        const doc = so(nd(l['CNPJ/CPF']));
        const nome = nd(l['Razão Social']);
        if (doc && fornPorDoc.has(doc)) return { existente: fornPorDoc.get(doc)!, chave: '' };
        if (fornPorNome.has(normalizar(nome))) return { existente: fornPorNome.get(normalizar(nome))!, chave: '' };
        return { existente: null, chave: normalizar(nome), nome, doc: doc.length === 11 || doc.length === 14 ? doc : null };
    };
    for (const l of linhas) {
        const f = chaveFornecedor(l);
        if (!f.existente && !fornecedoresNovos.has(f.chave)) fornecedoresNovos.set(f.chave, { name: f.nome!, cnpj: f.doc ?? null });
    }

    // ----------------------------------------------------------- resumo
    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);
    const total = linhas.reduce((s, l) => s + dinheiro(l['A Pagar']), 0);
    const vencidas = linhas.filter((l) => data(l['Vencimento'])! < hoje);
    const porCategoria = new Map<string, { n: number; v: number }>();
    for (const l of linhas) {
        const [nome] = destinoCategoria(l['Categoria']);
        const o = porCategoria.get(nome) ?? { n: 0, v: 0 };
        o.n++; o.v += dinheiro(l['A Pagar']);
        porCategoria.set(nome, o);
    }

    console.log(`\nLoja: ${loja.name} (CNPJ ${loja.cnpj ?? '-'})  ·  lançado por: ${usuario.name} <${usuario.email}>`);
    console.log(`\nVAI APAGAR: ${contasHoje.length} contas a pagar (${contasHoje.filter((c) => c.status === 'PAID').length} pagas) e ${recorrenciasHoje} recorrências.`);
    console.log(`VAI CRIAR: ${linhas.length} contas · total ${brl(total)} · ${vencidas.length} já vencidas (${brl(vencidas.reduce((s, l) => s + dinheiro(l['A Pagar']), 0))})`);
    console.log(`           ${fornecedoresNovos.size} fornecedores novos · ${categoriasNovas.size} categorias novas${categoriasNovas.size ? ` (${[...categoriasNovas.values()].map((c) => c.name).join(', ')})` : ''}`);
    console.log('\nPor categoria:');
    [...porCategoria.entries()].sort((a, b) => b[1].v - a[1].v).forEach(([k, o]) => console.log(`  ${k.padEnd(32)} ${String(o.n).padStart(5)}  ${brl(o.v)}`));

    if (!aplicar) {
        console.log('\nSIMULAÇÃO — nada foi gravado. Para gravar, rode de novo com --aplicar.\n');
        return;
    }

    // ------------------------------------------------------------ grava
    await prisma.$transaction(async (tx) => {
        const ids = contasHoje.map((c) => c.id);
        if (ids.length) {
            await tx.incomingGoodsNf.updateMany({ where: { billId: { in: ids } }, data: { billId: null } });
            await tx.incomingServiceNf.updateMany({ where: { billId: { in: ids } }, data: { billId: null } });
            await tx.pagamentoAvisado.updateMany({ where: { billId: { in: ids } }, data: { billId: null } });
            await tx.conciliacaoExtratoItem.updateMany({ where: { billId: { in: ids } }, data: { billId: null, baixaFeita: false } });
            await tx.bill.deleteMany({ where: { id: { in: ids } } });
        }
        await tx.billRecorrencia.deleteMany({ where: { storeId: loja.id } });

        for (const [n, c] of categoriasNovas) {
            const criada = await tx.billCategory.create({ data: { name: c.name, nameNormalized: n, group: c.group, empresaId: loja.empresaId } });
            catPorNome.set(n, criada.id);
        }
        const fornNovosIds = new Map<string, string>();
        for (const [k, f] of fornecedoresNovos) {
            const criado = await tx.supplier.create({ data: { name: f.name, nameNormalized: k, cnpj: f.cnpj, empresaId: loja.empresaId } });
            fornNovosIds.set(k, criado.id);
        }

        const dados = linhas.map((l) => {
            const venc = data(l['Vencimento'])!;
            const f = chaveFornecedor(l);
            const [catNome] = destinoCategoria(l['Categoria']);
            const boleto = /boleto/i.test(l['Documento']);
            const caixinha = /caixinha/i.test(l['Conta Corrente']);
            const type: PayableType = boleto ? 'BOLETO' : 'NO_BILL';
            const paymentMethod: BillPaymentMethod = caixinha ? 'CASH' : boleto ? 'BANK_SLIP' : 'BANK_TRANSFER';
            const nf = nd(l['Nota Fiscal']);
            const parcela = nd(l['Parcela']);
            const descricao = [
                nd(l['Razão Social']),
                nf ? `NF ${nf.replace(/^0+/, '')}` : null,
                parcela && parcela !== '001/001' ? `parcela ${parcela}` : null,
            ].filter(Boolean).join(' — ');
            const retidos = ['Valor PIS', 'Valor COFINS', 'Valor CSLL', 'Valor IR', 'Valor ISS', 'Valor INSS']
                .filter((c) => dinheiro(l[c]) > 0).map((c) => `${c.replace('Valor ', '')} ${brl(dinheiro(l[c]))}`);
            const notas = [
                'Importada do Omie.',
                `Categoria no Omie: ${nd(l['Categoria']) || '-'} · Conta corrente: ${nd(l['Conta Corrente']) || '-'} · Documento: ${nd(l['Documento']) || '-'}`,
                `Origem: ${nd(l['Origem']) || '-'}`,
                `Emissão ${nd(l['Emissão']) || '-'} · Previsão ${nd(l['Previsão']) || '-'} · Registro ${nd(l['Registro']) || '-'}`,
                nd(l['CNPJ/CPF']) ? `CNPJ/CPF do fornecedor: ${nd(l['CNPJ/CPF'])}` : null,
                nd(l['Número']) ? `Número: ${nd(l['Número'])}` : null,
                nd(l['Pedido de Venda']) ? `Pedido: ${nd(l['Pedido de Venda'])}` : null,
                nd(l['Projeto']) ? `Projeto: ${nd(l['Projeto'])}` : null,
                dinheiro(l['Valor da Conta']) !== dinheiro(l['A Pagar']) ? `Valor da conta ${brl(dinheiro(l['Valor da Conta']))} · líquido ${brl(dinheiro(l['Valor Líquido']))}` : null,
                retidos.length ? `Retidos: ${retidos.join(', ')}` : null,
                nd(l['Tags']) ? `Tags: ${nd(l['Tags'])}` : null,
            ].filter(Boolean).join('\n');
            return {
                description: descricao.slice(0, 250),
                value: dinheiro(l['A Pagar']),
                type,
                paymentMethod,
                dueDate: venc,
                status: (venc < hoje ? 'OVERDUE' : 'OPEN') as BillStatus,
                storeId: loja.id,
                supplierId: f.existente ?? fornNovosIds.get(f.chave) ?? null,
                categoryId: catPorNome.get(normalizar(catNome)) ?? null,
                launchedById: usuario.id,
                notes: notas,
            };
        });
        for (let i = 0; i < dados.length; i += 500) {
            await tx.bill.createMany({ data: dados.slice(i, i + 500) });
        }
    }, { timeout: 300_000, maxWait: 30_000 });

    console.log(`\nPRONTO: ${linhas.length} contas criadas na loja ${loja.name}.\n`);
}

main()
    .catch((e) => {
        console.error('\nERRO — nada foi gravado:', e?.message ?? e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
