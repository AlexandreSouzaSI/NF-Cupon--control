import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { IngredientUnidade, Prisma, UserRole } from '@prisma/client';
import * as XLSX from 'xlsx';

import { PrismaService } from '../../prisma/prisma.service';

// Normaliza pra facilitar agrupar o mesmo produto entre importações
// diferentes (e, mais pra frente, casar com o nome do item na NF de
// entrada): maiúsculo, sem espaço duplicado, sem espaço nas pontas. Não
// mexe em acento — os nomes do PDV normalmente já vêm sem.
function normalizarProduto(nome: string): string {
    return nome
        .toString()
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}

// Quanto de um ingrediente um prato vendido consumiu, respeitando o
// tipo de unidade DELE (não é sempre peso): ingrediente KG divide por
// 1000 (o "gramas" da ficha técnica é peso mesmo); ingrediente UNIDADE
// não divide (o "gramas" da ficha técnica ali guarda quantas UNIDADES o
// prato leva, ex: Coxinha 5 = 5 coxinhas). Reaproveitado tanto no
// consumo real (ingredientsSummary) quanto na sugestão de compra
// (listaCompraSugerida).
function calcularQuantidade(
    unidadeMedida: IngredientUnidade,
    quantidadeVendida: number,
    gramasOuUnidades: number,
): number {
    if (unidadeMedida === 'UNIDADE') {
        return quantidadeVendida * gramasOuUnidades;
    }

    return (quantidadeVendida * gramasOuUnidades) / 1000;
}

// Quantas peças/pacotes inteiros um total em KG equivale, dado o peso
// de UMA peça/pacote (em gramas) — ex: 6kg de picanha com peça de
// 1200g = 5 peças. Arredonda pra cima: não dá pra fechar um pedido
// pedindo "meia picanha". Só faz sentido pra ingrediente KG que tenha
// esse peso configurado — null quando não dá pra converter.
function calcularUnidadesEquivalentes(
    totalKg: number,
    pesoUnidadeGramas: number | null | undefined,
): number | null {
    if (!pesoUnidadeGramas || pesoUnidadeGramas <= 0) return null;

    const totalGramas = totalKg * 1000;

    return Math.ceil(totalGramas / pesoUnidadeGramas);
}

// Linhas que vêm na planilha do PDV mas não são produto de verdade —
// taxa de serviço e couvert artístico, por exemplo — e por isso não
// devem entrar em nenhuma análise (resumo, ranking, gráficos, consumo
// de ingrediente). Os dados originais continuam salvos no import, só
// saem das consultas de análise. Usa "contains" (não igualdade exata)
// pra pegar variações como "Taxa de Serviço 10%" ou "Couvert Artístico".
const PALAVRAS_EXCLUIDAS_DA_ANALISE = ['TAXA DE SERVIÇO', 'COUVERT'];

function filtroExcluirAnaliseWhere(): Prisma.ProductSalesEntryWhereInput {
    return {
        NOT: {
            OR: PALAVRAS_EXCLUIDAS_DA_ANALISE.map((palavra) => ({
                produtoChave: { contains: palavra },
            })),
        },
    };
}

// Palavras que indicam categoria de bebida — usadas só pela Lista de
// Compra Sugerida pra separar comida de bebida (o usuário pediu pra
// tratar bebida à parte, em outro momento; por ora a lista de compra
// cobre só o que é alimento). "contains" com "insensitive" pega
// variações de maiúscula/minúscula que a categoria vier na planilha do
// PDV (ela não passa por normalizarProduto). Se a loja usar um nome de
// categoria de bebida que não está aqui, é só adicionar na lista.
const PALAVRAS_BEBIDA = [
    'BEBIDA',
    'DRINK',
    'SUCO',
    'REFRIGERANTE',
    'CERVEJA',
    'CHOPP',
    'CHOPE',
    'DESTILADO',
    'VINHO',
    'ÁGUA',
    'AGUA',
    'COQUETEL',
    'CAIPIRINHA',
    'DOSE',
    'ENERGÉTICO',
    'ENERGETICO',
];

function filtroExcluirBebidaWhere(): Prisma.ProductSalesEntryWhereInput {
    return {
        NOT: {
            OR: PALAVRAS_BEBIDA.map((palavra) => ({
                categoria: { contains: palavra, mode: 'insensitive' },
            })),
        },
    };
}

// Os dois padrões de período que a loja usa pra dividir a semana do
// relatório de vendas (ex: um relatório de Terça a Quinta, outro de
// Sexta a Segunda — juntos cobrem a semana inteira). "SEMANA" não é um
// padrão em si, é a soma dos dois.
type PadraoPeriodo = 'TERCA_QUINTA' | 'SEXTA_SEGUNDA';
type TipoListaCompra = PadraoPeriodo | 'SEMANA';

// Dia da semana (getUTCDay(): 0 = domingo) em que cada padrão costuma
// COMEÇAR — usado pra classificar cada importação já feita em um dos
// dois grupos, sem precisar que o usuário marque isso na hora do
// upload (já dá pra inferir pelo periodoInicio que ele já informa).
const DIA_SEMANA_PADRAO: Record<PadraoPeriodo, number> = {
    TERCA_QUINTA: 2,
    SEXTA_SEGUNDA: 5,
};

const LABEL_PADRAO: Record<TipoListaCompra, string> = {
    TERCA_QUINTA: 'Terça a Quinta',
    SEXTA_SEGUNDA: 'Sexta a Segunda',
    SEMANA: 'Semana inteira (Terça a Segunda)',
};

// Percentual de margem de segurança aplicado sobre o PICO histórico de
// cada ingrediente — o usuário pediu explicitamente pra não trabalhar
// "à risca" (na média): em vez disso, a sugestão usa o maior consumo já
// visto entre os períodos comparáveis e aumenta esse valor em 20%, pra
// ter folga e não faltar.
const MARGEM_SEGURANCA_SUGESTAO = 0.2;

// Colunas de margem da tabela "Opções vendidas" (pico + 10%/20%/30%,
// arredondado pro inteiro mais próximo — pedido é sempre em unidades
// inteiras de prato/porção) — pensada pra bater com a planilha que a
// loja já usava antes ("Lista de Quantidades"), só que calculada a
// partir do pico automaticamente em vez de digitada à mão toda vez.
const MARGENS_OPCOES_VENDIDAS = [0.1, 0.2, 0.3];

// Divide o mês em 3 partes pra comparar períodos parecidos entre si —
// início de mês costuma vender diferente de fim de mês (ex: perto do
// pagamento). A sugestão pro próximo período que cai no início do mês
// só olha o pico entre períodos passados que TAMBÉM caíram no início do
// mês (idem meio/fim), em vez de misturar tudo.
type ParteDoMes = 'INICIO' | 'MEIO' | 'FIM';

function parteDoMes(dia: number): ParteDoMes {
    if (dia <= 10) return 'INICIO';
    if (dia <= 20) return 'MEIO';
    return 'FIM';
}

const LABEL_PARTE_MES: Record<ParteDoMes, string> = {
    INICIO: 'início de mês',
    MEIO: 'meio de mês',
    FIM: 'final de mês',
};

// A partir de hoje, acha a data do próximo dia da semana pedido (ex: a
// próxima terça-feira) — é essa data que diz se a sugestão de hoje é
// pra um período de início, meio ou fim do mês que vem, sem precisar
// que o usuário informe isso na mão.
function proximaOcorrencia(diaSemana: number): Date {
    const hoje = new Date();
    const hojeUTC = new Date(
        Date.UTC(
            hoje.getUTCFullYear(),
            hoje.getUTCMonth(),
            hoje.getUTCDate(),
            12,
            0,
            0,
        ),
    );

    for (let i = 0; i < 7; i++) {
        const candidato = new Date(hojeUTC);
        candidato.setUTCDate(hojeUTC.getUTCDate() + i);
        if (candidato.getUTCDay() === diaSemana) return candidato;
    }

    return hojeUTC;
}

// Filtro de intervalo de datas livre (Dashboard/Produtos/Ingredientes):
// entra qualquer importação cujo período tenha ALGUMA sobreposição com o
// intervalo pedido — ex: filtro "01 a 31 de agosto" pega tanto uma
// importação "21 a 24 de agosto" quanto uma "28 a 03 de setembro".
// Importação sem período salvo (nome do arquivo não deu pra ler e
// ninguém preencheu na mão) fica de fora do filtro por data, mas
// continua aparecendo normalmente no modo "Tudo".
function filtroPeriodoRangeWhere(
    periodoInicio?: string,
    periodoFim?: string,
): Prisma.ProductSalesImportWhereInput {
    const inicio = parseDateInput(periodoInicio);
    const fim = parseDateInput(periodoFim);

    const filtro: Prisma.ProductSalesImportWhereInput = {};

    if (inicio) filtro.periodoFim = { gte: inicio };
    if (fim) filtro.periodoInicio = { lte: fim };

    return filtro;
}

// Célula de valor/quantidade pode vir como number (comum, já que Excel
// guarda moeda como número formatado) ou, em planilhas exportadas de
// forma diferente, como texto "R$ 1.265,26" / "1.265,26" — trata os dois
// casos em vez de assumir só um.
function parseNumeroCell(value: unknown): number | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const texto = String(value)
        .replace(/[^\d,.-]/g, '')
        .trim();

    if (!texto) return null;

    // Formato brasileiro: milhar com ponto, decimal com vírgula.
    const semMilhar = texto.includes(',')
        ? texto.replace(/\./g, '').replace(',', '.')
        : texto;

    const parsed = Number(semMilhar);

    return Number.isFinite(parsed) ? parsed : null;
}

// "AAAA-MM-DD" (vindo de <input type="date">) -> Date ao meio-dia UTC —
// mesmo padrão usado no resto do projeto pra não recuar um dia por causa
// do fuso horário.
function parseDateInput(value?: string | null): Date | null {
    if (!value) return null;
    const data = new Date(`${value}T12:00:00.000Z`);
    return Number.isNaN(data.getTime()) ? null : data;
}

const MESES_PT: Record<string, number> = {
    janeiro: 0,
    fevereiro: 1,
    marco: 2,
    março: 2,
    abril: 3,
    maio: 4,
    junho: 5,
    julho: 6,
    agosto: 7,
    setembro: 8,
    outubro: 9,
    novembro: 10,
    dezembro: 11,
};

function normalizarTexto(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

// O PDV já exporta o arquivo nomeado com o período (ex: "Anchieta dia 21
// a 24 de agosto.xlsx") — quando o usuário não preenche as datas na
// tela, tenta ler o período direto do nome do arquivo em vez de deixar
// a importação sem período.
function extrairPeriodoDoNomeArquivo(
    nomeArquivo: string,
): { inicio: Date; fim: Date } | null {
    const semExtensao = nomeArquivo.replace(/\.[^.]+$/, '');
    const match = semExtensao.match(/(\d{1,2})\s*a\s*(\d{1,2})\s*de\s*([a-zçãé]+)/i);

    if (!match) return null;

    const diaInicio = Number(match[1]);
    const diaFim = Number(match[2]);
    const mesFimIndex = MESES_PT[normalizarTexto(match[3])];

    if (
        mesFimIndex == null ||
        diaInicio < 1 ||
        diaInicio > 31 ||
        diaFim < 1 ||
        diaFim > 31
    ) {
        return null;
    }

    const anoBase = new Date().getUTCFullYear();

    let mesInicioIndex = mesFimIndex;
    let anoInicio = anoBase;

    // Ex: "31 a 03 de agosto" — início cai no mês anterior ao citado.
    if (diaInicio > diaFim) {
        mesInicioIndex = mesFimIndex - 1;
        if (mesInicioIndex < 0) {
            mesInicioIndex = 11;
            anoInicio -= 1;
        }
    }

    const inicio = new Date(Date.UTC(anoInicio, mesInicioIndex, diaInicio, 12, 0, 0));
    const fim = new Date(Date.UTC(anoBase, mesFimIndex, diaFim, 12, 0, 0));

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
        return null;
    }

    return { inicio, fim };
}

// "16/09/2026, 13:37:41" -> Date. new Date() nativo não lê esse formato
// (dd/mm/aaaa) de forma confiável entre ambientes, então parseia campo a
// campo.
function parseDataExportacao(texto: unknown): Date | null {
    if (!texto || typeof texto !== 'string') return null;

    const match = texto
        .trim()
        .match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})/);

    if (!match) return null;

    const [, dia, mes, ano, hora, min, seg] = match;

    const data = new Date(
        Number(ano),
        Number(mes) - 1,
        Number(dia),
        Number(hora),
        Number(min),
        Number(seg),
    );

    return Number.isNaN(data.getTime()) ? null : data;
}

@Injectable()
export class ProductSalesService {
    constructor(private prisma: PrismaService) { }

    private getAllowedStoreIds(user: any): string[] | undefined {
        if (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        ) {
            return undefined;
        }

        return (
            user.userStores?.map(
                (item: any) => item.storeId || item.store?.id,
            ) || []
        );
    }

    private ensureStoreAccess(storeId: string, user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (!allowedStoreIds) return;

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException('Você não tem acesso a esta loja.');
        }
    }

    // Lê a planilha de vendas por produto (ex: export "Nu Galho Raiz") e
    // grava um lote novo (ProductSalesImport + uma ProductSalesEntry por
    // linha). Formato esperado, fixo por enquanto (mesmo layout em todas as
    // exportações desse sistema de PDV):
    //   B1 = nome do local, B2 = exportado por, B3 = exportado em
    //   a partir da linha 5: A = categoria, B = produto, C = quantidade,
    //   E = valor (D/F..M são as formas de pagamento, ignoradas por ora).
    async importExcel(
        storeId: string,
        file: Express.Multer.File,
        user: any,
        periodo?: { inicio?: string; fim?: string },
    ) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        if (!file) {
            throw new BadRequestException('Envie o arquivo Excel (.xlsx).');
        }

        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
        });

        if (!store) {
            throw new NotFoundException('Loja não encontrada.');
        }

        let workbook: XLSX.WorkBook;

        try {
            workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: false });
        } catch {
            throw new BadRequestException(
                'Não consegui ler esse arquivo — confirme que é um .xlsx válido.',
            );
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        if (!sheet) {
            throw new BadRequestException('A planilha não tem nenhuma aba.');
        }

        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            raw: true,
            defval: null,
        });

        const nomeLocal =
            typeof rows[0]?.[1] === 'string' ? (rows[0][1] as string).trim() : null;
        const exportadoPor =
            typeof rows[1]?.[1] === 'string' ? (rows[1][1] as string).trim() : null;
        const exportadoEm = parseDataExportacao(rows[2]?.[1]);

        const entradas: {
            categoria: string;
            produto: string;
            produtoChave: string;
            quantidade: number;
            valor: number;
        }[] = [];

        // Linha 5 da planilha = índice 4 (linhas 1-4 são cabeçalho/metadados).
        for (let i = 4; i < rows.length; i++) {
            const linha = rows[i];
            if (!linha) continue;

            const categoria = linha[0];
            const produto = linha[1];

            if (
                produto == null ||
                String(produto).trim() === '' ||
                categoria == null ||
                String(categoria).trim() === ''
            ) {
                continue;
            }

            const quantidade = parseNumeroCell(linha[2]);
            const valor = parseNumeroCell(linha[4]);

            if (quantidade == null || valor == null) continue;

            entradas.push({
                categoria: String(categoria).trim(),
                produto: String(produto).trim(),
                produtoChave: normalizarProduto(String(produto)),
                quantidade,
                valor,
            });
        }

        if (entradas.length === 0) {
            throw new BadRequestException(
                'Não encontrei nenhuma linha de produto válida a partir da linha 5 (categoria, produto, quantidade e valor).',
            );
        }

        let periodoInicio = parseDateInput(periodo?.inicio);
        let periodoFim = parseDateInput(periodo?.fim);

        // Usuário não informou o período na tela — tenta ler do nome do
        // arquivo antes de deixar em branco.
        if (!periodoInicio && !periodoFim) {
            const doNomeArquivo = extrairPeriodoDoNomeArquivo(file.originalname);

            if (doNomeArquivo) {
                periodoInicio = doNomeArquivo.inicio;
                periodoFim = doNomeArquivo.fim;
            }
        }

        const importCriado = await this.prisma.productSalesImport.create({
            data: {
                storeId,
                nomeLocal,
                exportadoPor,
                exportadoEm,
                periodoInicio,
                periodoFim,
                arquivoOriginal: file.originalname,
                totalLinhas: entradas.length,
                importedById: user.id,
                entries: {
                    create: entradas,
                },
            },
            include: {
                _count: { select: { entries: true } },
            },
        });

        return importCriado;
    }

    async findImports(
        user: any,
        filters?: { storeId?: string; page?: number; pageSize?: number },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const page = filters?.page && filters.page > 0 ? filters.page : 1;
        const pageSize =
            filters?.pageSize && filters.pageSize > 0 ? filters.pageSize : 10;

        const where = {
            storeId:
                filters?.storeId ||
                (allowedStoreIds ? { in: allowedStoreIds } : undefined),
        };

        const [items, total] = await Promise.all([
            this.prisma.productSalesImport.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: { select: { entries: true } },
                    importedBy: { select: { name: true } },
                },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.productSalesImport.count({ where }),
        ]);

        return { items, total, page, pageSize };
    }

    // Editar período/nome de uma importação já feita — não re-processa a
    // planilha, só corrige metadado (ex: errou a data ao importar).
    async updateImport(
        id: string,
        user: any,
        data: { periodoInicio?: string; periodoFim?: string; nomeLocal?: string },
    ) {
        const item = await this.prisma.productSalesImport.findUnique({
            where: { id },
        });

        if (!item) {
            throw new NotFoundException('Importação não encontrada.');
        }

        this.ensureStoreAccess(item.storeId, user);

        return this.prisma.productSalesImport.update({
            where: { id },
            data: {
                periodoInicio:
                    data.periodoInicio !== undefined
                        ? parseDateInput(data.periodoInicio)
                        : undefined,
                periodoFim:
                    data.periodoFim !== undefined
                        ? parseDateInput(data.periodoFim)
                        : undefined,
                nomeLocal:
                    data.nomeLocal !== undefined
                        ? data.nomeLocal.trim() || null
                        : undefined,
            },
        });
    }

    async removeImport(id: string, user: any) {
        const item = await this.prisma.productSalesImport.findUnique({
            where: { id },
        });

        if (!item) {
            throw new NotFoundException('Importação não encontrada.');
        }

        this.ensureStoreAccess(item.storeId, user);

        await this.prisma.productSalesImport.delete({ where: { id } });

        return { ok: true };
    }

    // Resumo por produto — soma quantidade e valor de todas as linhas que
    // batem com os filtros (agrupando pela mesma "produtoChave" mesmo que
    // tenha vindo de importações diferentes). É o que alimenta a aba
    // "Produtos" (ranking por quantidade vendida / faturamento).
    async productSummary(
        user: any,
        params: {
            storeId: string;
            importId?: string;
            categoria?: string;
            periodoInicio?: string;
            periodoFim?: string;
        },
    ) {
        if (!params.storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(params.storeId, user);

        const where: Prisma.ProductSalesEntryWhereInput = {
            import: {
                storeId: params.storeId,
                ...(params.periodoInicio || params.periodoFim
                    ? filtroPeriodoRangeWhere(params.periodoInicio, params.periodoFim)
                    : {}),
            },
            ...filtroExcluirAnaliseWhere(),
        };

        if (params.importId) {
            where.importId = params.importId;
        }

        if (params.categoria) {
            where.categoria = params.categoria;
        }

        const [entries, produtosComReceita] = await Promise.all([
            this.prisma.productSalesEntry.findMany({
                where,
                select: {
                    categoria: true,
                    produto: true,
                    produtoChave: true,
                    quantidade: true,
                    valor: true,
                },
            }),
            this.prisma.productRecipeItem.findMany({
                where: { storeId: params.storeId },
                select: { produtoChave: true },
                distinct: ['produtoChave'],
            }),
        ]);

        const chavesComReceita = new Set(
            produtosComReceita.map((p) => p.produtoChave),
        );

        const porProduto = new Map<
            string,
            {
                produto: string;
                categoria: string;
                quantidade: number;
                valor: number;
            }
        >();

        for (const entry of entries) {
            const atual = porProduto.get(entry.produtoChave);
            const quantidade = Number(entry.quantidade);
            const valor = Number(entry.valor);

            if (atual) {
                atual.quantidade += quantidade;
                atual.valor += valor;
            } else {
                porProduto.set(entry.produtoChave, {
                    produto: entry.produto,
                    categoria: entry.categoria,
                    quantidade,
                    valor,
                });
            }
        }

        const lista = Array.from(porProduto.entries())
            .map(([produtoChave, item]) => ({
                ...item,
                produtoChave,
                ticketMedio: item.quantidade > 0 ? item.valor / item.quantidade : 0,
                temReceita: chavesComReceita.has(produtoChave),
            }))
            .sort((a, b) => b.valor - a.valor);

        const categorias = Array.from(
            new Set(entries.map((e) => e.categoria)),
        ).sort();

        // Resumo por categoria — alimenta os "quadrados" da aba Produtos.
        // Já vem com o produto mais vendido de cada categoria (por valor)
        // pra dar um preview no card, sem precisar entrar pra ver.
        const porCategoriaMap = new Map<
            string,
            {
                categoria: string;
                totalQuantidade: number;
                totalValor: number;
                produtoMaisVendido: string | null;
            }
        >();

        for (const item of lista) {
            const atual = porCategoriaMap.get(item.categoria);

            if (!atual) {
                porCategoriaMap.set(item.categoria, {
                    categoria: item.categoria,
                    totalQuantidade: item.quantidade,
                    totalValor: item.valor,
                    // lista já vem ordenada por valor desc, então o
                    // primeiro produto visto de cada categoria é o mais
                    // vendido dela.
                    produtoMaisVendido: item.produto,
                });
                continue;
            }

            atual.totalQuantidade += item.quantidade;
            atual.totalValor += item.valor;
        }

        const porCategoria = Array.from(porCategoriaMap.values()).sort(
            (a, b) => b.totalValor - a.totalValor,
        );

        return {
            totalProdutos: lista.length,
            porCategoria,
            totalQuantidade: lista.reduce((acc, item) => acc + item.quantidade, 0),
            totalValor: lista.reduce((acc, item) => acc + item.valor, 0),
            categorias,
            produtos: lista,
        };
    }

    // Ficha técnica de UM prato: lista de ingredientes + gramas que ele
    // leva (ex: Chapa de Contra Filé -> Batata 400g, Contra Filé 400g).
    async getRecipe(user: any, params: { storeId: string; produto: string }) {
        this.ensureStoreAccess(params.storeId, user);

        const produtoChave = normalizarProduto(params.produto);

        const itens = await this.prisma.productRecipeItem.findMany({
            where: { storeId: params.storeId, produtoChave },
            include: { ingredient: { select: { id: true, nome: true } } },
            orderBy: { createdAt: 'asc' },
        });

        return itens.map((item) => ({
            id: item.id,
            ingredienteId: item.ingredientId,
            ingrediente: item.ingredient.nome,
            gramas: Number(item.gramas),
        }));
    }

    // Substitui a ficha técnica inteira de um prato pela lista enviada
    // (apaga as linhas antigas e recria) — mais simples que tentar dar
    // diff de quem adicionou/removeu/editou uma linha. Cada ingrediente é
    // criado automaticamente na primeira vez que alguém digita o nome
    // dele (findOrCreate por nome normalizado), igual ao fornecedor
    // digitável das Compras.
    async saveRecipe(
        user: any,
        params: {
            storeId: string;
            produto: string;
            itens: { ingrediente: string; gramas: number }[];
        },
    ) {
        if (!params.storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(params.storeId, user);

        if (!params.produto || !params.produto.trim()) {
            throw new BadRequestException('Produto inválido.');
        }

        const produtoChave = normalizarProduto(params.produto);
        const produto = params.produto.trim();

        const itensValidos = (params.itens || []).filter(
            (item) =>
                item.ingrediente &&
                item.ingrediente.trim() &&
                Number(item.gramas) > 0,
        );

        return this.prisma.$transaction(async (tx) => {
            await tx.productRecipeItem.deleteMany({
                where: { storeId: params.storeId, produtoChave },
            });

            for (const item of itensValidos) {
                const nomeChave = normalizarProduto(item.ingrediente);

                const ingredient = await tx.ingredient.upsert({
                    where: {
                        storeId_nomeChave: {
                            storeId: params.storeId,
                            nomeChave,
                        },
                    },
                    update: {},
                    create: {
                        storeId: params.storeId,
                        nome: item.ingrediente.trim(),
                        nomeChave,
                    },
                });

                await tx.productRecipeItem.create({
                    data: {
                        storeId: params.storeId,
                        produtoChave,
                        produto,
                        ingredientId: ingredient.id,
                        gramas: Number(item.gramas),
                    },
                });
            }

            const itens = await tx.productRecipeItem.findMany({
                where: { storeId: params.storeId, produtoChave },
                include: { ingredient: { select: { id: true, nome: true } } },
                orderBy: { createdAt: 'asc' },
            });

            return itens.map((item) => ({
                id: item.id,
                ingredienteId: item.ingredientId,
                ingrediente: item.ingredient.nome,
                gramas: Number(item.gramas),
            }));
        });
    }

    // Lista de ingredientes já cadastrados pela loja — pra sugestão
    // (autocomplete) na hora de montar a ficha técnica de um prato, e
    // pra tela de configuração (unidade de medida / peso da peça).
    async listIngredients(user: any, storeId: string) {
        this.ensureStoreAccess(storeId, user);

        return this.prisma.ingredient.findMany({
            where: { storeId },
            orderBy: { nome: 'asc' },
        });
    }

    // Configura como um ingrediente deve ser contado: KG (peso, padrão)
    // ou UNIDADE (contagem — Pastel, Coxinha, Costelinha Suína...), e
    // opcionalmente o peso de UMA peça/pacote inteiro (só faz sentido
    // pra KG — Picanha peça ~1200g, Batata Frita pacote 400g) pra além
    // do KG total, sugerir também "quantas peças/pacotes" comprar. Não
    // mexe em nenhuma ficha técnica já cadastrada — o valor guardado em
    // ProductRecipeItem.gramas continua o mesmo, só muda como ele é
    // interpretado dali pra frente (ver calcularQuantidade).
    async atualizarConfigIngrediente(
        user: any,
        ingredientId: string,
        data: {
            unidadeMedida?: IngredientUnidade;
            pesoUnidadeGramas?: number | null;
            isProteina?: boolean;
            porcaoPadraoGramas?: number | null;
        },
    ) {
        const ingredient = await this.prisma.ingredient.findUnique({
            where: { id: ingredientId },
        });

        if (!ingredient) {
            throw new NotFoundException('Ingrediente não encontrado.');
        }

        this.ensureStoreAccess(ingredient.storeId, user);

        if (
            data.unidadeMedida &&
            !Object.values(IngredientUnidade).includes(data.unidadeMedida)
        ) {
            throw new BadRequestException('Unidade de medida inválida.');
        }

        return this.prisma.ingredient.update({
            where: { id: ingredientId },
            data: {
                unidadeMedida: data.unidadeMedida,
                pesoUnidadeGramas:
                    data.pesoUnidadeGramas === undefined
                        ? undefined
                        : data.pesoUnidadeGramas === null ||
                            Number(data.pesoUnidadeGramas) <= 0
                            ? null
                            : Number(data.pesoUnidadeGramas),
                isProteina: data.isProteina === undefined ? undefined : !!data.isProteina,
                porcaoPadraoGramas:
                    data.porcaoPadraoGramas === undefined
                        ? undefined
                        : data.porcaoPadraoGramas === null ||
                            Number(data.porcaoPadraoGramas) <= 0
                            ? null
                            : Number(data.porcaoPadraoGramas),
            },
        });
    }

    // Quanto de cada ingrediente foi consumido no período importado —
    // soma, pra cada prato vendido que leva aquele ingrediente na ficha
    // técnica, quantidadeVendida * gramas/1000 (ingrediente KG, peso) ou
    // quantidadeVendida * gramas (ingrediente UNIDADE, contagem — ver
    // calcularQuantidade). Isso é o que resolve "quantos contra filé eu
    // vendi" ou "quantas coxinhas eu vendi", já somando todos os pratos
    // diferentes que usam aquele ingrediente (chapa, espeto etc.), não
    // só um produto isolado.
    async ingredientsSummary(
        user: any,
        params: {
            storeId: string;
            importId?: string;
            categoria?: string;
            periodoInicio?: string;
            periodoFim?: string;
        },
    ) {
        if (!params.storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(params.storeId, user);

        const where: Prisma.ProductSalesEntryWhereInput = {
            import: {
                storeId: params.storeId,
                ...(params.periodoInicio || params.periodoFim
                    ? filtroPeriodoRangeWhere(params.periodoInicio, params.periodoFim)
                    : {}),
            },
            ...filtroExcluirAnaliseWhere(),
        };

        if (params.importId) where.importId = params.importId;
        if (params.categoria) where.categoria = params.categoria;

        const [entries, recipeItems] = await Promise.all([
            this.prisma.productSalesEntry.findMany({
                where,
                select: { produto: true, produtoChave: true, quantidade: true },
            }),
            this.prisma.productRecipeItem.findMany({
                where: { storeId: params.storeId },
                include: {
                    ingredient: {
                        select: {
                            id: true,
                            nome: true,
                            unidadeMedida: true,
                            pesoUnidadeGramas: true,
                            isProteina: true,
                            porcaoPadraoGramas: true,
                        },
                    },
                },
            }),
        ]);

        const quantidadePorProduto = new Map<
            string,
            { produto: string; quantidade: number }
        >();

        for (const entry of entries) {
            const atual = quantidadePorProduto.get(entry.produtoChave);
            const quantidade = Number(entry.quantidade);

            if (atual) {
                atual.quantidade += quantidade;
            } else {
                quantidadePorProduto.set(entry.produtoChave, {
                    produto: entry.produto,
                    quantidade,
                });
            }
        }

        const porIngrediente = new Map<
            string,
            {
                ingredienteId: string;
                ingrediente: string;
                unidadeMedida: IngredientUnidade;
                pesoUnidadeGramas: number | null;
                isProteina: boolean;
                porcaoPadraoGramas: number | null;
                quantidade: number;
                pratos: {
                    produto: string;
                    quantidadeVendida: number;
                    quantidade: number;
                }[];
            }
        >();

        // Quantas porções de CADA tamanho foram preparadas, por
        // ingrediente — ex: Filé Mignon pode ter linhas de receita com
        // 200g (prato normal) e 100g (prato Kids); cada uma conta como
        // um "tamanho de porção" diferente, e a quantidade de porções
        // daquele tamanho é a própria quantidade vendida do prato que
        // usa esse tamanho (um prato vendido = uma porção preparada
        // daquele tamanho). Isso resolve "quantas picanhas de 200g vão
        // dar" sem precisar configurar nada a mais — já está na ficha
        // técnica. Só faz sentido pra ingrediente KG (pra UNIDADE a
        // "gramas" já é contagem, não tamanho de porção).
        const porcoesPorIngrediente = new Map<string, Map<number, number>>();

        for (const item of recipeItems) {
            const vendido = quantidadePorProduto.get(item.produtoChave);

            // Prato tem ficha técnica cadastrada mas não vendeu nada no
            // recorte atual (ou ainda nunca foi importado) — não entra na
            // conta, mas também não é erro.
            if (!vendido || vendido.quantidade <= 0) continue;

            const gramas = Number(item.gramas);

            const quantidade = calcularQuantidade(
                item.ingredient.unidadeMedida,
                vendido.quantidade,
                gramas,
            );

            const linha = {
                produto: item.produto,
                quantidadeVendida: vendido.quantidade,
                quantidade,
            };

            const atual = porIngrediente.get(item.ingredientId);

            if (atual) {
                atual.quantidade += quantidade;
                atual.pratos.push(linha);
            } else {
                porIngrediente.set(item.ingredientId, {
                    ingredienteId: item.ingredientId,
                    ingrediente: item.ingredient.nome,
                    unidadeMedida: item.ingredient.unidadeMedida,
                    pesoUnidadeGramas: item.ingredient.pesoUnidadeGramas
                        ? Number(item.ingredient.pesoUnidadeGramas)
                        : null,
                    isProteina: item.ingredient.isProteina,
                    porcaoPadraoGramas: item.ingredient.porcaoPadraoGramas
                        ? Number(item.ingredient.porcaoPadraoGramas)
                        : null,
                    quantidade,
                    pratos: [linha],
                });
            }

            if (item.ingredient.unidadeMedida === 'KG') {
                let porGramas = porcoesPorIngrediente.get(item.ingredientId);

                if (!porGramas) {
                    porGramas = new Map();
                    porcoesPorIngrediente.set(item.ingredientId, porGramas);
                }

                porGramas.set(gramas, (porGramas.get(gramas) || 0) + vendido.quantidade);
            }
        }

        const ingredientes = Array.from(porIngrediente.values())
            .map((item) => ({
                ...item,
                // "totalKg" só faz sentido pra ingrediente KG — mantém o
                // nome pra não quebrar quem já consome esse endpoint,
                // mas pra ingrediente UNIDADE fica 0 (o valor de verdade
                // está em "quantidade").
                totalKg: item.unidadeMedida === 'KG' ? item.quantidade : 0,
                unidadesEquivalentes:
                    item.unidadeMedida === 'KG'
                        ? calcularUnidadesEquivalentes(
                            item.quantidade,
                            item.pesoUnidadeGramas,
                        )
                        : null,
                porcoes: Array.from(
                    (porcoesPorIngrediente.get(item.ingredienteId) || new Map()).entries(),
                )
                    .map(([gramas, quantidadePorcoes]) => ({
                        gramas,
                        quantidade: quantidadePorcoes,
                    }))
                    .sort((a, b) => b.gramas - a.gramas),
                pratos: item.pratos.sort((a, b) => b.quantidade - a.quantidade),
            }))
            .sort((a, b) => b.quantidade - a.quantidade);

        return {
            totalIngredientes: ingredientes.length,
            totalKg: ingredientes
                .filter((item) => item.unidadeMedida === 'KG')
                .reduce((acc, item) => acc + item.quantidade, 0),
            ingredientes,
        };
    }

    // Importa fichas técnicas em massa a partir de uma planilha .xlsx no
    // formato padrão: coluna A = nome do prato, colunas B em diante = um
    // ingrediente por célula no formato "Ingrediente - Gramatura" (ex:
    // "Picanha - 400"), quantas colunas forem precisas. Dados a partir da
    // linha 2 (linha 1 é cabeçalho, ignorada). Cada prato da planilha
    // SUBSTITUI a ficha técnica que já existir pra ele — igual ao
    // comportamento de salvar uma receita manualmente, só que em lote.
    // Antes de aplicar, tira um backup de tudo que já existia (ver
    // desfazerImportacaoFichasTecnicas) pra dar pra voltar atrás.
    async importarFichasTecnicasExcel(
        storeId: string,
        file: Express.Multer.File,
        user: any,
    ) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        if (!file) {
            throw new BadRequestException('Envie o arquivo Excel (.xlsx).');
        }

        let workbook: XLSX.WorkBook;

        try {
            workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: false });
        } catch {
            throw new BadRequestException(
                'Não consegui ler esse arquivo — confirme que é um .xlsx válido.',
            );
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        if (!sheet) {
            throw new BadRequestException('A planilha não tem nenhuma aba.');
        }

        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            raw: true,
            defval: null,
        });

        // "Ingrediente - 400" ou "Ingrediente - 400g" -> separa pelo
        // ÚLTIMO traço seguido de número (o nome do ingrediente pode ter
        // traço no meio, ex: "SP - Molho da casa").
        function parseCelulaIngrediente(
            valor: unknown,
        ): { nome: string; gramas: number } | null {
            if (valor == null) return null;

            const texto = String(valor).trim();
            if (!texto) return null;

            const match = texto.match(/^(.*)-\s*([\d.,]+)\s*g?\s*$/i);
            if (!match) return null;

            const nome = match[1].trim();
            const gramas = Number(match[2].replace(',', '.'));

            if (!nome || !Number.isFinite(gramas) || gramas <= 0) return null;

            return { nome, gramas };
        }

        type PratoPlanilha = {
            produto: string;
            produtoChave: string;
            itens: { nome: string; gramas: number }[];
        };

        const pratos: PratoPlanilha[] = [];

        // Linha 2 da planilha = índice 1 (linha 1 é cabeçalho).
        for (let i = 1; i < rows.length; i++) {
            const linha = rows[i];
            if (!linha) continue;

            const produtoCelula = linha[0];
            if (produtoCelula == null || String(produtoCelula).trim() === '') {
                continue;
            }

            const produto = String(produtoCelula).trim();
            const itens: { nome: string; gramas: number }[] = [];

            for (let col = 1; col < linha.length; col++) {
                const item = parseCelulaIngrediente(linha[col]);
                if (item) itens.push(item);
            }

            if (itens.length === 0) continue;

            pratos.push({
                produto,
                produtoChave: normalizarProduto(produto),
                itens,
            });
        }

        if (pratos.length === 0) {
            throw new BadRequestException(
                'Não encontrei nenhuma linha válida a partir da linha 2 (coluna A = prato, colunas seguintes = "Ingrediente - Gramatura").',
            );
        }

        await this.salvarBackupFichasTecnicas(storeId);

        for (const prato of pratos) {
            await this.prisma.$transaction(async (tx) => {
                await tx.productRecipeItem.deleteMany({
                    where: { storeId, produtoChave: prato.produtoChave },
                });

                for (const item of prato.itens) {
                    const nomeChave = normalizarProduto(item.nome);

                    const ingredient = await tx.ingredient.upsert({
                        where: { storeId_nomeChave: { storeId, nomeChave } },
                        update: {},
                        create: { storeId, nome: item.nome, nomeChave },
                    });

                    await tx.productRecipeItem.create({
                        data: {
                            storeId,
                            produtoChave: prato.produtoChave,
                            produto: prato.produto,
                            ingredientId: ingredient.id,
                            gramas: item.gramas,
                        },
                    });
                }
            });
        }

        return {
            totalPratos: pratos.length,
            totalIngredientes: pratos.reduce((acc, p) => acc + p.itens.length, 0),
        };
    }

    // Tira uma foto de tudo que existe hoje em ProductRecipeItem pra essa
    // loja e guarda como backup de 1 nível (sobrescreve o anterior) —
    // usado antes de rodar uma importação em massa, pra dar pra desfazer.
    private async salvarBackupFichasTecnicas(storeId: string) {
        const atuais = await this.prisma.productRecipeItem.findMany({
            where: { storeId },
            include: { ingredient: { select: { nome: true } } },
        });

        const snapshot = atuais.map((item) => ({
            produtoChave: item.produtoChave,
            produto: item.produto,
            ingredienteNome: item.ingredient.nome,
            gramas: Number(item.gramas),
        }));

        await this.prisma.productRecipeImportBackup.upsert({
            where: { storeId },
            update: { snapshot },
            create: { storeId, snapshot },
        });
    }

    // Existe backup disponível pra essa loja? (pra UI decidir se mostra o
    // botão "Desfazer última importação").
    async statusBackupFichasTecnicas(storeId: string, user: any) {
        this.ensureStoreAccess(storeId, user);

        const backup = await this.prisma.productRecipeImportBackup.findUnique({
            where: { storeId },
            select: { createdAt: true },
        });

        return { disponivel: !!backup, criadoEm: backup?.createdAt ?? null };
    }

    // Desfaz a última importação em massa de fichas técnicas — restaura
    // exatamente o que existia em ProductRecipeItem antes dela (backup de
    // 1 nível só; rodar uma nova importação sobrescreve esse backup).
    async desfazerImportacaoFichasTecnicas(storeId: string, user: any) {
        this.ensureStoreAccess(storeId, user);

        const backup = await this.prisma.productRecipeImportBackup.findUnique({
            where: { storeId },
        });

        if (!backup) {
            throw new BadRequestException(
                'Não tem nenhuma importação recente pra desfazer.',
            );
        }

        const snapshot = backup.snapshot as {
            produtoChave: string;
            produto: string;
            ingredienteNome: string;
            gramas: number;
        }[];

        await this.prisma.$transaction(async (tx) => {
            await tx.productRecipeItem.deleteMany({ where: { storeId } });

            for (const item of snapshot) {
                const nomeChave = normalizarProduto(item.ingredienteNome);

                const ingredient = await tx.ingredient.upsert({
                    where: { storeId_nomeChave: { storeId, nomeChave } },
                    update: {},
                    create: { storeId, nome: item.ingredienteNome, nomeChave },
                });

                await tx.productRecipeItem.create({
                    data: {
                        storeId,
                        produtoChave: item.produtoChave,
                        produto: item.produto,
                        ingredientId: ingredient.id,
                        gramas: item.gramas,
                    },
                });
            }

            await tx.productRecipeImportBackup.delete({ where: { storeId } });
        });

        return { restaurados: snapshot.length };
    }

    // Apaga TODAS as fichas técnicas da loja de uma vez — pensado pra
    // quem quer começar do zero e reimportar uma planilha nova em cima
    // de uma base limpa, sem receita antiga sobrando de produto que não
    // veio na nova planilha. Tira backup antes (mesmo backup usado pelo
    // "desfazer"), então dá pra restaurar se limpar sem querer.
    async limparFichasTecnicas(storeId: string, user: any) {
        this.ensureStoreAccess(storeId, user);

        await this.salvarBackupFichasTecnicas(storeId);

        const resultado = await this.prisma.productRecipeItem.deleteMany({
            where: { storeId },
        });

        return { removidos: resultado.count };
    }

    // Gera a planilha modelo pra importação de fichas técnicas — coluna A
    // já vem preenchida com o nome de cada produto que já tem venda
    // importada nesta loja (mesma lista que aparece na aba Produtos),
    // ordenado alfabeticamente, pra garantir que o nome bate exatamente
    // com o produtoChave usado no resto do módulo. É só preencher as
    // colunas de ingrediente ao lado e importar de volta.
    async gerarModeloFichasTecnicas(storeId: string, user: any) {
        this.ensureStoreAccess(storeId, user);

        const entries = await this.prisma.productSalesEntry.findMany({
            where: {
                import: { storeId },
                ...filtroExcluirAnaliseWhere(),
            },
            select: { produto: true },
            distinct: ['produtoChave'],
        });

        const nomes = Array.from(new Set(entries.map((item) => item.produto))).sort(
            (a, b) => a.localeCompare(b, 'pt-BR'),
        );

        const linhas: (string | null)[][] = [
            ['Prato', 'Ingrediente 1', 'Ingrediente 2', 'Ingrediente 3', 'Ingrediente 4'],
            ...nomes.map((nome) => [nome]),
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(linhas);
        worksheet['!cols'] = [
            { wch: 40 },
            { wch: 28 },
            { wch: 28 },
            { wch: 28 },
            { wch: 28 },
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Fichas Tecnicas');

        const buffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
        }) as Buffer;

        return buffer;
    }

    // Lista de compra sugerida: em vez de uma média, olha o PICO — o
    // período de maior saída — de cada ingrediente entre os períodos JÁ
    // IMPORTADOS que seguem o mesmo padrão de dias do período pedido
    // (ex: toda importação cujo período começou numa terça-feira entra
    // no grupo "Terça a Quinta"), e soma 20% de margem de segurança em
    // cima do maior valor já visto. O usuário pediu explicitamente:
    // trabalhar na média deixa faltar em dia de pico, então a sugestão
    // parte do PIOR caso (maior consumo já registrado) + folga, não da
    // média.
    //
    // Também leva em conta a parte do mês: início de mês costuma vender
    // diferente de fim de mês, então a sugestão pro próximo período que
    // cai no início do mês só compara com períodos passados que também
    // caíram no início do mês (idem meio/fim) — ver proximaOcorrencia +
    // parteDoMes. "SEMANA" soma os dois padrões (Terça a Segunda =
    // semana inteira).
    async listaCompraSugerida(
        user: any,
        params: { storeId: string; tipo: TipoListaCompra },
    ) {
        if (!params.storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(params.storeId, user);

        if (!params.tipo || !LABEL_PADRAO[params.tipo]) {
            throw new BadRequestException(
                'Tipo inválido — use TERCA_QUINTA, SEXTA_SEGUNDA ou SEMANA.',
            );
        }

        if (params.tipo === 'SEMANA') {
            const [tercaQuinta, sextaSegunda] = await Promise.all([
                this.calcularSugestaoPorPadrao(params.storeId, 'TERCA_QUINTA'),
                this.calcularSugestaoPorPadrao(params.storeId, 'SEXTA_SEGUNDA'),
            ]);

            return this.combinarSugestoesSemana(tercaQuinta, sextaSegunda);
        }

        return this.calcularSugestaoPorPadrao(params.storeId, params.tipo);
    }

    // Calcula, pra cada ingrediente, o pico (maior KG num único período)
    // entre as importações que batem com o padrão de dias E com a parte
    // do mês (início/meio/fim) do próximo período desse padrão — e soma
    // a margem de segurança em cima. Se ainda não tiver histórico
    // suficiente da mesma parte do mês, cai pra comparar com todos os
    // períodos do padrão (melhor um pico "misturado" do que devolver
    // vazio por falta de dado).
    private async calcularSugestaoPorPadrao(storeId: string, padrao: PadraoPeriodo) {
        const diaSemanaEsperado = DIA_SEMANA_PADRAO[padrao];

        const imports = await this.prisma.productSalesImport.findMany({
            where: { storeId, periodoInicio: { not: null } },
            select: { id: true, periodoInicio: true, periodoFim: true },
        });

        const periodosBatendo = imports.filter(
            (imp) => imp.periodoInicio!.getUTCDay() === diaSemanaEsperado,
        );

        const parteAlvo = parteDoMes(
            proximaOcorrencia(diaSemanaEsperado).getUTCDate(),
        );

        let periodosAlvo = periodosBatendo.filter(
            (p) => parteDoMes(p.periodoInicio!.getUTCDate()) === parteAlvo,
        );

        const usouTodosOsPeriodos =
            periodosAlvo.length === 0 && periodosBatendo.length > 0;

        if (usouTodosOsPeriodos) periodosAlvo = periodosBatendo;

        type Ingrediente = {
            ingredienteId: string;
            ingrediente: string;
            unidadeMedida: IngredientUnidade;
            pesoUnidadeGramas: number | null;
            pico: number;
            sugestao: number;
            unidadesEquivalentesSugestao: number | null;
            ocorrencias: number;
            periodoPico: { periodoInicio: Date; periodoFim: Date | null } | null;
        };

        // "Opções vendidas": pico + margens por PRODUTO exato (não pelo
        // ingrediente agregado) — ex: "Picanha 200G" fica separado de
        // "Picanha 400G". É o formato que a loja já usava numa planilha
        // manual (nome do prato, quantidade, +10%/20%/30%) — aqui é
        // calculado sozinho a partir do pico histórico.
        type Produto = {
            produtoChave: string;
            produto: string;
            pico: number;
            sugestao10: number;
            sugestao20: number;
            sugestao30: number;
            ocorrencias: number;
            periodoPico: { periodoInicio: Date; periodoFim: Date | null } | null;
        };

        // "Tamanho": mesma ideia, mas agrupando pelo INGREDIENTE + o
        // tamanho de porção (gramas) da ficha técnica — junta pratos
        // diferentes que usam o mesmo corte no mesmo tamanho (ex: Picanha
        // na Chapa 200g + Picanha no Espeto 200g viram uma linha só).
        type Tamanho = {
            ingredienteId: string;
            ingrediente: string;
            gramas: number;
            pico: number;
            sugestao10: number;
            sugestao20: number;
            sugestao30: number;
            ocorrencias: number;
            periodoPico: { periodoInicio: Date; periodoFim: Date | null } | null;
        };

        if (periodosAlvo.length === 0) {
            return {
                tipo: padrao as TipoListaCompra,
                label: LABEL_PADRAO[padrao],
                parteMesAlvo: LABEL_PARTE_MES[parteAlvo],
                usouTodosOsPeriodos: false,
                totalPeriodosConsiderados: 0,
                periodos: [] as { periodoInicio: Date; periodoFim: Date | null }[],
                produtos: [] as Produto[],
                tamanhos: [] as Tamanho[],
                ingredientes: [] as Ingrediente[],
            };
        }

        const importIds = periodosAlvo.map((p) => p.id);

        const [entries, recipeItems] = await Promise.all([
            this.prisma.productSalesEntry.findMany({
                where: {
                    importId: { in: importIds },
                    ...filtroExcluirAnaliseWhere(),
                    ...filtroExcluirBebidaWhere(),
                },
                select: {
                    importId: true,
                    produto: true,
                    produtoChave: true,
                    quantidade: true,
                },
            }),
            // Lista de Compra só considera proteína (carne) OU ingrediente
            // contado por UNIDADE (Pastel, Coxinha, Camafeu, Costelinha
            // Suína...) — o resto (acompanhamento sem gramatura relevante
            // tipo arroz, salada, molho) fica de fora da sugestão de
            // compra, mesmo tendo ficha técnica cadastrada.
            this.prisma.productRecipeItem.findMany({
                where: {
                    storeId,
                    ingredient: {
                        OR: [{ isProteina: true }, { unidadeMedida: 'UNIDADE' }],
                    },
                },
                include: {
                    ingredient: {
                        select: {
                            id: true,
                            nome: true,
                            unidadeMedida: true,
                            pesoUnidadeGramas: true,
                            isProteina: true,
                            porcaoPadraoGramas: true,
                        },
                    },
                },
            }),
        ]);

        // Quantidade vendida por produto, separado por importação — pra
        // dar pra achar o pico DEPOIS de somar o consumo período a
        // período, sem misturar tudo numa soma só.
        const quantidadePorImportProduto = new Map<string, Map<string, number>>();

        for (const entry of entries) {
            let porProduto = quantidadePorImportProduto.get(entry.importId);

            if (!porProduto) {
                porProduto = new Map();
                quantidadePorImportProduto.set(entry.importId, porProduto);
            }

            porProduto.set(
                entry.produtoChave,
                (porProduto.get(entry.produtoChave) || 0) + Number(entry.quantidade),
            );
        }

        const periodoPorImportId = new Map(
            periodosAlvo.map((p) => [
                p.id,
                { periodoInicio: p.periodoInicio as Date, periodoFim: p.periodoFim },
            ]),
        );

        // Acha, num Map<chave, Map<importId, quantidade>>, a chave com o
        // maior valor num único período e em qual importação isso
        // aconteceu — usado pra "produtos", "tamanhos" e "ingredientes"
        // (mesma lógica de pico, três granularidades diferentes).
        function acharPico(porImport: Map<string, number>) {
            let pico = 0;
            let importIdPico: string | null = null;

            for (const [importId, valor] of porImport.entries()) {
                if (valor > pico) {
                    pico = valor;
                    importIdPico = importId;
                }
            }

            return {
                pico,
                ocorrencias: porImport.size,
                periodoPico: importIdPico
                    ? periodoPorImportId.get(importIdPico) || null
                    : null,
            };
        }

        // "Opções vendidas" (produtos): quantidade vendida de cada
        // produto exato, por importação — pico dela = base da tabela
        // estilo planilha (produto, quantidade, +10/20/30%). Só entra
        // produto que tenha ficha técnica com pelo menos um ingrediente
        // proteína/por unidade (recipeItems já vem filtrado assim) —
        // acompanhamento sem proteína (arroz, salada puros) fica de fora.
        const nomePorProdutoChave = new Map<string, string>();

        for (const entry of entries) {
            nomePorProdutoChave.set(entry.produtoChave, entry.produto);
        }

        const produtoChavesQualificadas = new Set(
            recipeItems.map((item) => item.produtoChave),
        );

        const produtos: Produto[] = Array.from(quantidadePorImportProduto.values())
            .flatMap((porProduto) => Array.from(porProduto.keys()))
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .filter((produtoChave) => produtoChavesQualificadas.has(produtoChave))
            .map((produtoChave) => {
                const porImport = new Map<string, number>();

                for (const [importId, porProduto] of quantidadePorImportProduto.entries()) {
                    const vendido = porProduto.get(produtoChave);
                    if (vendido) porImport.set(importId, vendido);
                }

                const { pico, ocorrencias, periodoPico } = acharPico(porImport);

                return {
                    produtoChave,
                    produto: nomePorProdutoChave.get(produtoChave) || produtoChave,
                    pico,
                    sugestao10: Math.round(pico * (1 + MARGENS_OPCOES_VENDIDAS[0])),
                    sugestao20: Math.round(pico * (1 + MARGENS_OPCOES_VENDIDAS[1])),
                    sugestao30: Math.round(pico * (1 + MARGENS_OPCOES_VENDIDAS[2])),
                    ocorrencias,
                    periodoPico,
                };
            })
            .sort((a, b) => b.pico - a.pico);

        // Quantidade consumida por ingrediente, por importação — já na
        // unidade certa de cada ingrediente (kg ou unidades, ver
        // calcularQuantidade).
        const quantidadePorIngredientePorImport = new Map<
            string,
            Map<string, number>
        >();
        const infoPorIngrediente = new Map<
            string,
            { nome: string; unidadeMedida: IngredientUnidade; pesoUnidadeGramas: number | null }
        >();

        // "Tamanho": quantidade vendida por (ingrediente + tamanho de
        // porção), por importação — só pra ingrediente KG, já que pra
        // UNIDADE a "gramas" já é contagem, não tamanho.
        //
        // Quando o ingrediente tem "porção padrão" configurada (ex: 200g
        // pra Ancho/Picanha/Baby Beef/Filé Mignon — corte sempre
        // porcionado nesse tamanho), qualquer gramatura da ficha técnica
        // MAIOR OU IGUAL à porção padrão é normalizada: arredonda pro
        // múltiplo inteiro mais próximo da porção padrão (ex: 400g e
        // 350g de Filé Mignon viram "2x 200g") e mescla tudo numa linha
        // só, multiplicando a quantidade vendida pelo multiplicador.
        // Gramatura MENOR que a porção padrão (ex: Filé Mignon 100g do
        // Kids) não mescla — é um corte/porção diferente, fica na sua
        // própria linha.
        const quantidadePorTamanhoPorImport = new Map<string, Map<string, number>>();
        const infoPorTamanho = new Map<
            string,
            { ingredienteId: string; ingrediente: string; gramas: number }
        >();

        for (const item of recipeItems) {
            infoPorIngrediente.set(item.ingredientId, {
                nome: item.ingredient.nome,
                unidadeMedida: item.ingredient.unidadeMedida,
                pesoUnidadeGramas: item.ingredient.pesoUnidadeGramas
                    ? Number(item.ingredient.pesoUnidadeGramas)
                    : null,
            });

            const gramas = Number(item.gramas);
            const porcaoPadrao = item.ingredient.porcaoPadraoGramas
                ? Number(item.ingredient.porcaoPadraoGramas)
                : null;

            let gramasTamanho = gramas;
            let multiplicadorTamanho = 1;

            if (porcaoPadrao && porcaoPadrao > 0 && gramas >= porcaoPadrao) {
                gramasTamanho = porcaoPadrao;
                multiplicadorTamanho = Math.max(1, Math.round(gramas / porcaoPadrao));
            }

            const chaveTamanho = `${item.ingredientId}|${gramasTamanho}`;

            if (item.ingredient.unidadeMedida === 'KG') {
                infoPorTamanho.set(chaveTamanho, {
                    ingredienteId: item.ingredientId,
                    ingrediente: item.ingredient.nome,
                    gramas: gramasTamanho,
                });
            }

            for (const importId of importIds) {
                const vendido = quantidadePorImportProduto
                    .get(importId)
                    ?.get(item.produtoChave);

                if (!vendido) continue;

                const quantidade = calcularQuantidade(
                    item.ingredient.unidadeMedida,
                    vendido,
                    gramas,
                );

                let porImport = quantidadePorIngredientePorImport.get(item.ingredientId);

                if (!porImport) {
                    porImport = new Map();
                    quantidadePorIngredientePorImport.set(item.ingredientId, porImport);
                }

                porImport.set(importId, (porImport.get(importId) || 0) + quantidade);

                if (item.ingredient.unidadeMedida === 'KG') {
                    let porImportTamanho = quantidadePorTamanhoPorImport.get(chaveTamanho);

                    if (!porImportTamanho) {
                        porImportTamanho = new Map();
                        quantidadePorTamanhoPorImport.set(chaveTamanho, porImportTamanho);
                    }

                    porImportTamanho.set(
                        importId,
                        (porImportTamanho.get(importId) || 0) +
                            vendido * multiplicadorTamanho,
                    );
                }
            }
        }

        const ingredientes: Ingrediente[] = Array.from(
            quantidadePorIngredientePorImport.entries(),
        )
            .map(([ingredientId, porImport]) => {
                let pico = 0;
                let importIdPico: string | null = null;

                for (const [importId, quantidade] of porImport.entries()) {
                    if (quantidade > pico) {
                        pico = quantidade;
                        importIdPico = importId;
                    }
                }

                const info = infoPorIngrediente.get(ingredientId);
                const sugestao = pico * (1 + MARGEM_SEGURANCA_SUGESTAO);

                return {
                    ingredienteId: ingredientId,
                    ingrediente: info?.nome || '',
                    unidadeMedida: info?.unidadeMedida || IngredientUnidade.KG,
                    pesoUnidadeGramas: info?.pesoUnidadeGramas ?? null,
                    pico,
                    sugestao,
                    unidadesEquivalentesSugestao:
                        info?.unidadeMedida === 'KG'
                            ? calcularUnidadesEquivalentes(
                                sugestao,
                                info?.pesoUnidadeGramas ?? null,
                            )
                            : null,
                    ocorrencias: porImport.size,
                    periodoPico: importIdPico
                        ? periodoPorImportId.get(importIdPico) || null
                        : null,
                };
            })
            .sort((a, b) => b.sugestao - a.sugestao);

        const tamanhos: Tamanho[] = Array.from(quantidadePorTamanhoPorImport.entries())
            .map(([chaveTamanho, porImport]) => {
                const info = infoPorTamanho.get(chaveTamanho);
                const { pico, ocorrencias, periodoPico } = acharPico(porImport);

                return {
                    ingredienteId: info?.ingredienteId || '',
                    ingrediente: info?.ingrediente || '',
                    gramas: info?.gramas || 0,
                    pico,
                    sugestao10: Math.round(pico * (1 + MARGENS_OPCOES_VENDIDAS[0])),
                    sugestao20: Math.round(pico * (1 + MARGENS_OPCOES_VENDIDAS[1])),
                    sugestao30: Math.round(pico * (1 + MARGENS_OPCOES_VENDIDAS[2])),
                    ocorrencias,
                    periodoPico,
                };
            })
            .sort(
                (a, b) =>
                    a.ingrediente.localeCompare(b.ingrediente, 'pt-BR') || b.gramas - a.gramas,
            );

        return {
            tipo: padrao as TipoListaCompra,
            label: LABEL_PADRAO[padrao],
            parteMesAlvo: LABEL_PARTE_MES[parteAlvo],
            usouTodosOsPeriodos,
            totalPeriodosConsiderados: periodosAlvo.length,
            periodos: periodosAlvo
                .map((p) => ({
                    periodoInicio: p.periodoInicio as Date,
                    periodoFim: p.periodoFim,
                }))
                .sort((a, b) => b.periodoInicio.getTime() - a.periodoInicio.getTime()),
            produtos,
            tamanhos,
            ingredientes,
        };
    }

    // "Semana inteira" = Terça a Quinta + Sexta a Segunda somados (juntos
    // cobrem os 7 dias, de terça a segunda). Soma a sugestão (pico + 20%)
    // de cada ingrediente nos dois padrões — cada um já com sua própria
    // parte do mês considerada (a Sexta-a-Segunda seguinte a uma
    // Terça-a-Quinta de fim de mês pode cair no início do mês seguinte).
    private combinarSugestoesSemana(
        tercaQuinta: Awaited<
            ReturnType<ProductSalesService['calcularSugestaoPorPadrao']>
        >,
        sextaSegunda: Awaited<
            ReturnType<ProductSalesService['calcularSugestaoPorPadrao']>
        >,
    ) {
        const mapa = new Map<
            string,
            {
                ingredienteId: string;
                ingrediente: string;
                unidadeMedida: IngredientUnidade;
                pesoUnidadeGramas: number | null;
                pico: number;
                sugestao: number;
                ocorrencias: number;
                // Não existe UM período de pico pra "semana inteira" (é a
                // soma de dois padrões diferentes) — null aqui, a tela
                // simplesmente não mostra a coluna de período pra essa
                // linha.
                periodoPico: null;
            }
        >();

        for (const item of [
            ...tercaQuinta.ingredientes,
            ...sextaSegunda.ingredientes,
        ]) {
            const atual = mapa.get(item.ingredienteId);

            if (atual) {
                atual.pico += item.pico;
                atual.sugestao += item.sugestao;
                atual.ocorrencias += item.ocorrencias;
            } else {
                mapa.set(item.ingredienteId, {
                    ingredienteId: item.ingredienteId,
                    ingrediente: item.ingrediente,
                    unidadeMedida: item.unidadeMedida,
                    pesoUnidadeGramas: item.pesoUnidadeGramas,
                    pico: item.pico,
                    sugestao: item.sugestao,
                    ocorrencias: item.ocorrencias,
                    periodoPico: null,
                });
            }
        }

        const ingredientes = Array.from(mapa.values())
            .map((item) => ({
                ...item,
                unidadesEquivalentesSugestao:
                    item.unidadeMedida === 'KG'
                        ? calcularUnidadesEquivalentes(
                            item.sugestao,
                            item.pesoUnidadeGramas,
                        )
                        : null,
            }))
            .sort((a, b) => b.sugestao - a.sugestao);

        // "Opções vendidas" e "Tamanho" da semana inteira: soma o pico de
        // cada padrão (Terça-Quinta pode ter um pico e Sexta-Segunda
        // outro, pro mesmo produto/tamanho) e recalcula as margens em
        // cima da soma — não dá pra só somar as sugestões prontas porque
        // cada uma já tem sua própria margem embutida.
        const mapaProdutos = new Map<
            string,
            {
                produtoChave: string;
                produto: string;
                pico: number;
                ocorrencias: number;
            }
        >();

        for (const item of [...tercaQuinta.produtos, ...sextaSegunda.produtos]) {
            const atual = mapaProdutos.get(item.produtoChave);

            if (atual) {
                atual.pico += item.pico;
                atual.ocorrencias += item.ocorrencias;
            } else {
                mapaProdutos.set(item.produtoChave, {
                    produtoChave: item.produtoChave,
                    produto: item.produto,
                    pico: item.pico,
                    ocorrencias: item.ocorrencias,
                });
            }
        }

        const produtos = Array.from(mapaProdutos.values())
            .map((item) => ({
                ...item,
                sugestao10: Math.round(item.pico * (1 + MARGENS_OPCOES_VENDIDAS[0])),
                sugestao20: Math.round(item.pico * (1 + MARGENS_OPCOES_VENDIDAS[1])),
                sugestao30: Math.round(item.pico * (1 + MARGENS_OPCOES_VENDIDAS[2])),
                periodoPico: null,
            }))
            .sort((a, b) => b.pico - a.pico);

        const mapaTamanhos = new Map<
            string,
            {
                ingredienteId: string;
                ingrediente: string;
                gramas: number;
                pico: number;
                ocorrencias: number;
            }
        >();

        for (const item of [...tercaQuinta.tamanhos, ...sextaSegunda.tamanhos]) {
            const chave = `${item.ingredienteId}|${item.gramas}`;
            const atual = mapaTamanhos.get(chave);

            if (atual) {
                atual.pico += item.pico;
                atual.ocorrencias += item.ocorrencias;
            } else {
                mapaTamanhos.set(chave, {
                    ingredienteId: item.ingredienteId,
                    ingrediente: item.ingrediente,
                    gramas: item.gramas,
                    pico: item.pico,
                    ocorrencias: item.ocorrencias,
                });
            }
        }

        const tamanhos = Array.from(mapaTamanhos.values())
            .map((item) => ({
                ...item,
                sugestao10: Math.round(item.pico * (1 + MARGENS_OPCOES_VENDIDAS[0])),
                sugestao20: Math.round(item.pico * (1 + MARGENS_OPCOES_VENDIDAS[1])),
                sugestao30: Math.round(item.pico * (1 + MARGENS_OPCOES_VENDIDAS[2])),
                periodoPico: null,
            }))
            .sort(
                (a, b) =>
                    a.ingrediente.localeCompare(b.ingrediente, 'pt-BR') || b.gramas - a.gramas,
            );

        return {
            tipo: 'SEMANA' as TipoListaCompra,
            label: LABEL_PADRAO.SEMANA,
            totalPeriodosConsiderados:
                tercaQuinta.totalPeriodosConsiderados +
                sextaSegunda.totalPeriodosConsiderados,
            periodos: [...tercaQuinta.periodos, ...sextaSegunda.periodos],
            produtos,
            tamanhos,
            ingredientes,
            detalhePorPadrao: { tercaQuinta, sextaSegunda },
        };
    }
}
