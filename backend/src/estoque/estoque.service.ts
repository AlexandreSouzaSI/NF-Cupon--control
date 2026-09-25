import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
    IngredientUnidade,
    Prisma,
    StockMovementOrigin,
    StockMovementType,
    UserRole,
} from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';

import { PrismaService } from '../../prisma/prisma.service';
import { parseFullNfeForView, type NfeView } from '../stores/sefaz-nfe-client';
import {
    PRODUCT_SALES_IMPORTED_EVENT,
    type ProductSalesImportedEvent,
} from '../common/events';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { LinkNfItemsDto } from './dto/link-nf-items.dto';
import { LinkPurchaseItemsDto } from './dto/link-purchase-items.dto';

// Categoria de negócio do StockItem — fixa nessas 6 opções (o frontend só
// deixa escolher uma delas; StockItem.categoria continua String no schema
// só pra não quebrar dado antigo fora dessa lista). "Ativo" é reservada
// pro futuro (bem físico reutilizável — copo de vidro, equipamento — não
// consumível), não usada em nenhum item hoje.
export const ESTOQUE_CATEGORIAS = [
    'Hortifruti',
    'Matéria Prima',
    'Revenda',
    'Embalagens',
    'Limpeza',
    'Ativo',
] as const;

// Mesmo normalizador usado em product-sales.service.ts (Ingredient,
// produtoChave) — maiúsculo, sem espaço duplicado/nas pontas. Mantido
// como cópia local (não exportado de lá) só pra não criar acoplamento
// entre os dois módulos.
function normalizarNome(nome: string): string {
    return nome.toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

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

@Injectable()
export class EstoqueService {
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

    // ---------------------------------------------------------------
    // Catálogo (StockItem)
    // ---------------------------------------------------------------

    async listItems(
        user: any,
        params: {
            storeId: string;
            categoria?: string;
            descricao?: string;
            search?: string;
            onlyNegative?: boolean;
        },
    ) {
        if (!params.storeId) {
            throw new BadRequestException('Selecione uma loja ativa no topo do sistema.');
        }

        this.ensureStoreAccess(params.storeId, user);

        const where: Prisma.StockItemWhereInput = {
            storeId: params.storeId,
            active: true,
        };

        if (params.categoria) where.categoria = params.categoria;
        // Filtro por Descrição — texto livre, então contains sem exigir
        // bater com a normalização de nomeChave (que é só pra busca por
        // Nome).
        if (params.descricao) {
            where.descricao = { contains: params.descricao, mode: 'insensitive' };
        }
        if (params.search) {
            where.nomeChave = { contains: normalizarNome(params.search) };
        }
        if (params.onlyNegative) {
            where.quantidadeAtual = { lt: 0 };
        }

        const items = await this.prisma.stockItem.findMany({
            where,
            orderBy: { nome: 'asc' },
        });

        return items.map((item) => this.serializeItem(item));
    }

    private serializeItem(item: any) {
        const quantidadeAtual = Number(item.quantidadeAtual);
        const valorMedioUnitario = item.valorMedioUnitario
            ? Number(item.valorMedioUnitario)
            : null;
        const estoqueMinimo = item.estoqueMinimo != null ? Number(item.estoqueMinimo) : null;
        const estoqueMaximo = item.estoqueMaximo != null ? Number(item.estoqueMaximo) : null;
        const abaixoDoMinimo = estoqueMinimo != null && quantidadeAtual < estoqueMinimo;
        // Sugestão de compra: se tem Máximo cadastrado, mira repor até lá
        // (nível alvo) — senão cai no comportamento antigo de repor só até
        // o Mínimo. Só dispara quando já está abaixo do mínimo (ponto de
        // pedido), igual antes.
        const quantidadeSugerida = abaixoDoMinimo
            ? Math.max(
                estoqueMaximo != null ? estoqueMaximo - quantidadeAtual : estoqueMinimo! - quantidadeAtual,
                0,
            )
            : 0;

        return {
            id: item.id,
            nome: item.nome,
            descricao: item.descricao,
            categoria: item.categoria,
            unidadeMedida: item.unidadeMedida,
            quantidadeAtual,
            valorMedioUnitario,
            valorEstoque:
                valorMedioUnitario && quantidadeAtual > 0
                    ? Number((quantidadeAtual * valorMedioUnitario).toFixed(2))
                    : null,
            negativo: quantidadeAtual < 0,
            estoqueMinimo,
            estoqueMaximo,
            abaixoDoMinimo,
            quantidadeSugerida,
            active: item.active,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }

    async listCategorias(user: any, storeId: string) {
        this.ensureStoreAccess(storeId, user);

        const items = await this.prisma.stockItem.findMany({
            where: { storeId, active: true, categoria: { not: null } },
            select: { categoria: true },
            distinct: ['categoria'],
        });

        return items
            .map((item) => item.categoria)
            .filter((c): c is string => !!c)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    // Itens com estoque mínimo configurado e saldo atual abaixo dele —
    // base da "Lista de Compra" do Estoque. Quantidade sugerida é só a
    // diferença até o mínimo (não gera pedido de mais que o necessário).
    async listaCompra(user: any, storeId: string) {
        if (!storeId) {
            throw new BadRequestException('Selecione uma loja ativa no topo do sistema.');
        }

        this.ensureStoreAccess(storeId, user);

        const items = await this.prisma.stockItem.findMany({
            where: {
                storeId,
                active: true,
                estoqueMinimo: { not: null },
            },
            orderBy: { nome: 'asc' },
        });

        return items
            .map((item) => this.serializeItem(item))
            .filter((item) => item.abaixoDoMinimo)
            .map((item) => ({
                ...item,
                custoEstimado:
                    item.valorMedioUnitario != null
                        ? Number((item.quantidadeSugerida * item.valorMedioUnitario).toFixed(2))
                        : null,
            }));
    }

    // Resumo pra aba Dashboard do Estoque — cards (qtd de itens, itens
    // abaixo do mínimo, valor total parado, itens negativos), distribuição
    // por Categoria (contagem + valor) e as últimas movimentações. Tudo
    // calculado em cima do mesmo serializeItem() usado na listagem, pra
    // não duplicar a conta de valorEstoque/abaixoDoMinimo.
    async getDashboard(user: any, storeId: string) {
        if (!storeId) {
            throw new BadRequestException('Selecione uma loja ativa no topo do sistema.');
        }

        this.ensureStoreAccess(storeId, user);

        const [items, ultimasMovimentacoes] = await Promise.all([
            this.prisma.stockItem.findMany({
                where: { storeId, active: true },
            }),
            this.prisma.stockMovement.findMany({
                where: { storeId },
                include: { stockItem: { select: { nome: true, unidadeMedida: true } } },
                orderBy: { data: 'desc' },
                take: 8,
            }),
        ]);

        const serializados = items.map((item) => this.serializeItem(item));

        const totalItens = serializados.length;
        const itensAbaixoDoMinimo = serializados.filter((i) => i.abaixoDoMinimo).length;
        const itensNegativos = serializados.filter((i) => i.negativo).length;
        const valorTotalEstoque = serializados.reduce(
            (soma, i) => soma + (i.valorEstoque || 0),
            0,
        );

        // Distribuição por Categoria — usa a lista fixa (ESTOQUE_CATEGORIAS)
        // como base pra sempre devolver todas as categorias em uso, mais um
        // grupo "Sem categoria" pro que não foi classificado ainda.
        const porCategoriaMap = new Map<string, { quantidadeItens: number; valorEstoque: number }>();
        for (const item of serializados) {
            const chave = item.categoria || 'Sem categoria';
            const atual = porCategoriaMap.get(chave) || { quantidadeItens: 0, valorEstoque: 0 };
            atual.quantidadeItens += 1;
            atual.valorEstoque += item.valorEstoque || 0;
            porCategoriaMap.set(chave, atual);
        }

        const porCategoria = Array.from(porCategoriaMap.entries())
            .map(([categoria, dados]) => ({
                categoria,
                quantidadeItens: dados.quantidadeItens,
                valorEstoque: Number(dados.valorEstoque.toFixed(2)),
            }))
            .sort((a, b) => b.valorEstoque - a.valorEstoque);

        const itensCriticos = serializados
            .filter((i) => i.abaixoDoMinimo)
            .sort((a, b) => a.quantidadeAtual - b.quantidadeAtual)
            .slice(0, 8)
            .map((i) => ({
                id: i.id,
                nome: i.nome,
                unidadeMedida: i.unidadeMedida,
                quantidadeAtual: i.quantidadeAtual,
                estoqueMinimo: i.estoqueMinimo,
                quantidadeSugerida: i.quantidadeSugerida,
            }));

        return {
            totalItens,
            itensAbaixoDoMinimo,
            itensNegativos,
            valorTotalEstoque: Number(valorTotalEstoque.toFixed(2)),
            porCategoria,
            itensCriticos,
            ultimasMovimentacoes: ultimasMovimentacoes.map((mov) => ({
                id: mov.id,
                stockItemNome: mov.stockItem.nome,
                unidadeMedida: mov.stockItem.unidadeMedida,
                tipo: mov.tipo,
                origem: mov.origem,
                quantidade: Number(mov.quantidade),
                data: mov.data,
            })),
        };
    }

    async createItem(dto: CreateStockItemDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const nomeChave = normalizarNome(dto.nome);

        const existing = await this.prisma.stockItem.findUnique({
            where: { storeId_nomeChave: { storeId: dto.storeId, nomeChave } },
        });

        if (existing) {
            throw new BadRequestException('Já existe um item de estoque com esse nome.');
        }

        const item = await this.prisma.stockItem.create({
            data: {
                storeId: dto.storeId,
                nome: dto.nome.trim(),
                nomeChave,
                descricao: dto.descricao?.trim() || null,
                categoria: dto.categoria?.trim() || null,
                unidadeMedida: (dto.unidadeMedida as IngredientUnidade) || 'KG',
                estoqueMinimo: dto.estoqueMinimo ?? null,
                estoqueMaximo: dto.estoqueMaximo ?? null,
            },
        });

        return this.serializeItem(item);
    }

    async updateItem(id: string, dto: UpdateStockItemDto, user: any) {
        const item = await this.prisma.stockItem.findUnique({ where: { id } });
        if (!item) throw new NotFoundException('Item de estoque não encontrado.');

        this.ensureStoreAccess(item.storeId, user);

        const data: Prisma.StockItemUpdateInput = {};

        if (dto.nome !== undefined) {
            data.nome = dto.nome.trim();
            data.nomeChave = normalizarNome(dto.nome);
        }
        if (dto.descricao !== undefined) data.descricao = dto.descricao?.trim() || null;
        if (dto.categoria !== undefined) data.categoria = dto.categoria?.trim() || null;
        if (dto.unidadeMedida !== undefined) data.unidadeMedida = dto.unidadeMedida as IngredientUnidade;
        if (dto.active !== undefined) data.active = dto.active;
        if (dto.estoqueMinimo !== undefined) data.estoqueMinimo = dto.estoqueMinimo;
        if (dto.estoqueMaximo !== undefined) data.estoqueMaximo = dto.estoqueMaximo;

        const updated = await this.prisma.stockItem.update({
            where: { id },
            data,
        });

        return this.serializeItem(updated);
    }

    // Edição em massa da unidade de medida — pra quando o usuário marca
    // vários itens (ex: todas as bebidas) e troca todos pra Litro de
    // uma vez, sem precisar abrir item por item.
    async bulkUpdateUnidade(ids: string[], unidadeMedida: string, user: any) {
        if (!ids || ids.length === 0) {
            throw new BadRequestException('Selecione ao menos um item.');
        }

        if (!Object.values(IngredientUnidade).includes(unidadeMedida as IngredientUnidade)) {
            throw new BadRequestException('Unidade de medida inválida.');
        }

        const items = await this.prisma.stockItem.findMany({ where: { id: { in: ids } } });

        if (items.length === 0) {
            throw new NotFoundException('Nenhum item de estoque encontrado.');
        }

        const storeIds = Array.from(new Set(items.map((i) => i.storeId)));
        for (const storeId of storeIds) {
            this.ensureStoreAccess(storeId, user);
        }

        await this.prisma.stockItem.updateMany({
            where: { id: { in: items.map((i) => i.id) } },
            data: { unidadeMedida: unidadeMedida as IngredientUnidade },
        });

        return { ok: true, atualizados: items.length };
    }

    // Exclusão de verdade (não é o "active: false" usado em outros
    // lugares) — só quem tem @Roles(ADMINISTRATIVO) no controller chega
    // aqui. Apaga em cascata todo o histórico de movimentação desse item
    // (StockMovement/StockSupplierItemMapping têm onDelete: Cascade no
    // schema) — por isso é restrito e o frontend pede confirmação antes.
    async removeItem(id: string, user: any) {
        const item = await this.prisma.stockItem.findUnique({ where: { id } });
        if (!item) throw new NotFoundException('Item de estoque não encontrado.');

        this.ensureStoreAccess(item.storeId, user);

        await this.prisma.stockItem.delete({ where: { id } });

        return { ok: true };
    }

    // ---------------------------------------------------------------
    // Movimentações (ledger)
    // ---------------------------------------------------------------

    async listMovements(
        user: any,
        params: { storeId: string; stockItemId?: string; page?: number; pageSize?: number },
    ) {
        if (!params.storeId) {
            throw new BadRequestException('Selecione uma loja ativa no topo do sistema.');
        }

        this.ensureStoreAccess(params.storeId, user);

        const page = params.page && params.page > 0 ? params.page : 1;
        const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20;

        const where: Prisma.StockMovementWhereInput = { storeId: params.storeId };
        if (params.stockItemId) where.stockItemId = params.stockItemId;

        const [items, total] = await Promise.all([
            this.prisma.stockMovement.findMany({
                where,
                include: {
                    stockItem: { select: { nome: true, unidadeMedida: true } },
                    createdBy: { select: { name: true } },
                },
                orderBy: { data: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.stockMovement.count({ where }),
        ]);

        return {
            items: items.map((mov) => ({
                id: mov.id,
                stockItemId: mov.stockItemId,
                stockItemNome: mov.stockItem.nome,
                unidadeMedida: mov.stockItem.unidadeMedida,
                tipo: mov.tipo,
                origem: mov.origem,
                quantidade: Number(mov.quantidade),
                valorTotal: mov.valorTotal ? Number(mov.valorTotal) : null,
                observacao: mov.observacao,
                data: mov.data,
                criadoPor: mov.createdBy?.name ?? null,
            })),
            total,
            page,
            pageSize,
        };
    }

    // Lançamento manual — entrada avulsa ou ajuste/baixa manual, item por
    // item. Único jeito de mexer no estoque que não tem sourceRef (não
    // precisa de idempotência: cada clique é um lançamento novo mesmo).
    async registrarMovimentoManual(dto: CreateStockMovementDto, user: any) {
        const item = await this.prisma.stockItem.findUnique({ where: { id: dto.stockItemId } });
        if (!item) throw new NotFoundException('Item de estoque não encontrado.');
        if (item.storeId !== dto.storeId) {
            throw new BadRequestException('Item de estoque não pertence a essa loja.');
        }

        this.ensureStoreAccess(dto.storeId, user);

        await this.prisma.$transaction(async (tx) => {
            await this.applyMovement(tx, {
                storeId: dto.storeId,
                stockItemId: dto.stockItemId,
                tipo: dto.tipo as StockMovementType,
                origem: StockMovementOrigin.MANUAL,
                quantidade: dto.quantidade,
                valorTotal: dto.valorTotal ?? null,
                observacao: dto.observacao ?? null,
                data: dto.data ? new Date(dto.data) : new Date(),
                createdById: user.id,
            });
        });

        const atualizado = await this.prisma.stockItem.findUnique({
            where: { id: dto.stockItemId },
        });

        return this.serializeItem(atualizado);
    }

    // Núcleo compartilhado por todo mundo que mexe no saldo (manual,
    // vínculo de NF, planilha, baixa automática de venda). Quando vem
    // sourceRef, reprocessar a MESMA origem não duplica o lançamento —
    // só ajusta a diferença (delta) no saldo, ver comentário do model
    // StockMovement no schema.
    private async applyMovement(
        tx: Prisma.TransactionClient,
        params: {
            storeId: string;
            stockItemId: string;
            tipo: StockMovementType;
            origem: StockMovementOrigin;
            quantidade: number;
            valorTotal?: number | null;
            sourceRef?: string | null;
            observacao?: string | null;
            data?: Date;
            createdById?: string | null;
        },
    ) {
        const sinal = params.tipo === StockMovementType.ENTRADA ? 1 : -1;

        if (params.sourceRef) {
            const existing = await tx.stockMovement.findUnique({
                where: {
                    storeId_sourceRef: { storeId: params.storeId, sourceRef: params.sourceRef },
                },
            });

            if (existing) {
                const deltaQuantidade = params.quantidade - Number(existing.quantidade);

                await tx.stockMovement.update({
                    where: { id: existing.id },
                    data: {
                        quantidade: params.quantidade,
                        valorTotal: params.valorTotal ?? null,
                        observacao: params.observacao ?? existing.observacao,
                    },
                });

                if (deltaQuantidade !== 0) {
                    await tx.stockItem.update({
                        where: { id: params.stockItemId },
                        data: { quantidadeAtual: { increment: sinal * deltaQuantidade } },
                    });
                }

                return;
            }
        }

        await tx.stockMovement.create({
            data: {
                storeId: params.storeId,
                stockItemId: params.stockItemId,
                tipo: params.tipo,
                origem: params.origem,
                quantidade: params.quantidade,
                valorTotal: params.valorTotal ?? null,
                sourceRef: params.sourceRef ?? null,
                observacao: params.observacao ?? null,
                data: params.data ?? new Date(),
                createdById: params.createdById ?? null,
            },
        });

        await tx.stockItem.update({
            where: { id: params.stockItemId },
            data: { quantidadeAtual: { increment: sinal * params.quantidade } },
        });

        // Custo médio ponderado — só recalcula em ENTRADA nova com valor
        // informado (planilha/manual sem valor não mexe nisso).
        if (params.tipo === StockMovementType.ENTRADA && params.valorTotal) {
            const item = await tx.stockItem.findUnique({ where: { id: params.stockItemId } });

            if (item) {
                const saldoDepois = Number(item.quantidadeAtual);
                const saldoAntes = Math.max(saldoDepois - params.quantidade, 0);
                const custoAntes = item.valorMedioUnitario ? Number(item.valorMedioUnitario) : 0;
                const totalAntes = saldoAntes * custoAntes;
                const novoSaldoBase = saldoAntes + params.quantidade;
                const novoCusto =
                    novoSaldoBase > 0
                        ? (totalAntes + params.valorTotal) / novoSaldoBase
                        : params.valorTotal / params.quantidade;

                await tx.stockItem.update({
                    where: { id: params.stockItemId },
                    data: { valorMedioUnitario: novoCusto },
                });
            }
        }
    }

    private async resolveOrCreateStockItem(
        tx: Prisma.TransactionClient,
        params: {
            storeId: string;
            stockItemId?: string;
            novoNome?: string;
            novaCategoria?: string;
            novaUnidadeMedida?: 'KG' | 'LITRO' | 'UNIDADE';
        },
    ) {
        if (params.stockItemId) {
            const item = await tx.stockItem.findUnique({ where: { id: params.stockItemId } });
            if (!item || item.storeId !== params.storeId) {
                throw new BadRequestException('Item de estoque inválido pra essa loja.');
            }
            return item;
        }

        if (!params.novoNome || !params.novoNome.trim()) {
            throw new BadRequestException(
                'Informe um item de estoque existente ou o nome de um item novo.',
            );
        }

        const nomeChave = normalizarNome(params.novoNome);

        return tx.stockItem.upsert({
            where: { storeId_nomeChave: { storeId: params.storeId, nomeChave } },
            update: {},
            create: {
                storeId: params.storeId,
                nome: params.novoNome.trim(),
                nomeChave,
                categoria: params.novaCategoria?.trim() || null,
                unidadeMedida: (params.novaUnidadeMedida as IngredientUnidade) || 'KG',
            },
        });
    }

    // ---------------------------------------------------------------
    // Vínculo de itens de NF aceita (entrada por compra)
    // ---------------------------------------------------------------

    // NFs de mercadoria já "resolvidas" (aceitas OU vinculadas a uma
    // compra/conta pelo fluxo antigo "Vincular à compra existente") que
    // ainda não tiveram os itens ligados ao estoque. As duas formas de
    // dar baixa numa NF são válidas — quem compra pode esquecer de
    // cadastrar a compra antes, então "aceitar sem compra registrada"
    // também entra aqui; toda NF resolvida precisa terminar vinculada
    // no estoque. Mesma condição tri-OR já usada em
    // purchases.service.ts pra lista de "NFs Aceitas".
    async listNfsPendentes(user: any, storeId: string) {
        this.ensureStoreAccess(storeId, user);

        return this.prisma.incomingGoodsNf.findMany({
            where: {
                storeId,
                stockLinkedAt: null,
                OR: [{ accepted: true }, { purchaseId: { not: null } }, { billId: { not: null } }],
            },
            orderBy: { issueDate: 'desc' },
            select: {
                id: true,
                chaveAcesso: true,
                issuerName: true,
                issuerCnpj: true,
                value: true,
                issueDate: true,
                fileUrl: true,
            },
            take: 100,
        });
    }

    // Lê e parseia o XML dessa NF do disco — mesmo parser usado pelo
    // NfViewerModal (viewIncomingGoodsNf em purchases.service.ts).
    // Compartilhado por getNfItensParaVinculo (mostrar pra UI) e
    // vincularNfAoEstoque (precisa da descrição de cada item pra
    // gravar/atualizar o StockSupplierItemMapping).
    private parseNfItensRaw(incoming: { fileUrl: string | null }): NfeView {
        let parsed: NfeView | null = null;

        if (incoming.fileUrl) {
            const relativePath = incoming.fileUrl.replace(/^\/uploads\//, '');
            const filePath = join(process.cwd(), 'uploads', relativePath);

            if (existsSync(filePath)) {
                try {
                    const xml = readFileSync(filePath, 'utf-8');
                    parsed = parseFullNfeForView(xml);
                } catch {
                    parsed = null;
                }
            }
        }

        if (!parsed) {
            throw new BadRequestException(
                'Não consegui ler os itens dessa NF (XML indisponível ou incompleto).',
            );
        }

        return parsed;
    }

    // Itens parseados do XML dessa NF — mesmo parser usado pelo
    // NfViewerModal (viewIncomingGoodsNf em purchases.service.ts), só
    // que aqui a gente precisa do array de itens com índice estável pra
    // gerar o sourceRef de cada vínculo.
    async getNfItensParaVinculo(incomingNfId: string, user: any) {
        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) throw new NotFoundException('NF não encontrada.');

        this.ensureStoreAccess(incoming.storeId, user);

        if (!incoming.accepted && !incoming.purchaseId && !incoming.billId) {
            throw new BadRequestException(
                'Só é possível vincular estoque de NFs já aceitas ou vinculadas a uma compra.',
            );
        }

        const parsed = this.parseNfItensRaw(incoming);

        // Já vinculados antes (reabrir pra editar) — devolve junto pra UI
        // pré-preencher em vez de começar do zero.
        const jaVinculados = await this.prisma.stockMovement.findMany({
            where: { storeId: incoming.storeId, sourceRef: { startsWith: `nf:${incomingNfId}:item:` } },
            include: { stockItem: { select: { id: true, nome: true } } },
        });

        const vinculoPorIndex = new Map<number, { stockItemId: string; stockItemNome: string; quantidade: number; valorTotal: number | null }>();

        for (const mov of jaVinculados) {
            const match = mov.sourceRef?.match(/:item:(\d+)$/);
            if (!match) continue;

            vinculoPorIndex.set(Number(match[1]), {
                stockItemId: mov.stockItem.id,
                stockItemNome: mov.stockItem.nome,
                quantidade: Number(mov.quantidade),
                valorTotal: mov.valorTotal ? Number(mov.valorTotal) : null,
            });
        }

        // "Aprendizado" por fornecedor — pros itens que ainda não têm
        // vínculo salvo, busca se esse MESMO fornecedor (CNPJ) já mandou
        // item com essa descrição antes e sugere o StockItem usado da
        // última vez (ver StockSupplierItemMapping no schema).
        let sugestaoPorDescricao = new Map<string, { stockItemId: string; stockItemNome: string; categoria: string | null }>();

        if (incoming.issuerCnpj) {
            const descricoesSemVinculo = parsed.itens
                .map((item, index) => ({ index, descricao: item.descricao }))
                .filter(({ index }) => !vinculoPorIndex.has(index))
                .map(({ descricao }) => normalizarNome(descricao || ''))
                .filter((d) => d.length > 0);

            const descricoesUnicas = Array.from(new Set(descricoesSemVinculo));

            if (descricoesUnicas.length > 0) {
                const mapeamentos = await this.prisma.stockSupplierItemMapping.findMany({
                    where: {
                        storeId: incoming.storeId,
                        issuerCnpj: incoming.issuerCnpj,
                        descricaoChave: { in: descricoesUnicas },
                    },
                    include: { stockItem: { select: { id: true, nome: true, categoria: true } } },
                });

                sugestaoPorDescricao = new Map(
                    mapeamentos.map((mapa) => [
                        mapa.descricaoChave,
                        {
                            stockItemId: mapa.stockItem.id,
                            stockItemNome: mapa.stockItem.nome,
                            categoria: mapa.stockItem.categoria,
                        },
                    ]),
                );
            }
        }

        return {
            chaveAcesso: incoming.chaveAcesso,
            issuerName: incoming.issuerName,
            stockLinkedAt: incoming.stockLinkedAt,
            itens: parsed.itens.map((item, index) => ({
                itemIndex: index,
                descricao: item.descricao,
                ncm: item.ncm,
                quantidade: item.quantidade,
                unidade: item.unidade,
                valorUnitario: item.valorUnitario,
                valorTotal: item.valorTotal,
                vinculo: vinculoPorIndex.get(index) ?? null,
                sugestao: vinculoPorIndex.has(index)
                    ? null
                    : sugestaoPorDescricao.get(normalizarNome(item.descricao || '')) ?? null,
            })),
        };
    }

    async vincularNfAoEstoque(incomingNfId: string, dto: LinkNfItemsDto, user: any) {
        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) throw new NotFoundException('NF não encontrada.');
        this.ensureStoreAccess(incoming.storeId, user);

        if (!incoming.accepted && !incoming.purchaseId && !incoming.billId) {
            throw new BadRequestException(
                'Só é possível vincular estoque de NFs já aceitas ou vinculadas a uma compra.',
            );
        }

        const parsed = this.parseNfItensRaw(incoming);

        await this.prisma.$transaction(async (tx) => {
            for (const linha of dto.itens) {
                const stockItem = await this.resolveOrCreateStockItem(tx, {
                    storeId: incoming.storeId,
                    stockItemId: linha.stockItemId,
                    novoNome: linha.novoNome,
                    novaCategoria: linha.novaCategoria,
                    novaUnidadeMedida: linha.novaUnidadeMedida,
                });

                await this.applyMovement(tx, {
                    storeId: incoming.storeId,
                    stockItemId: stockItem.id,
                    tipo: StockMovementType.ENTRADA,
                    origem: StockMovementOrigin.NF_COMPRA,
                    quantidade: linha.quantidade,
                    valorTotal: linha.valorTotal ?? null,
                    sourceRef: `nf:${incomingNfId}:item:${linha.itemIndex}`,
                    data: incoming.issueDate ?? new Date(),
                    createdById: user.id,
                });

                // "Aprendizado" — grava/atualiza a sugestão pra próxima NF
                // desse MESMO fornecedor com item de descrição igual (ver
                // StockSupplierItemMapping no schema). Sem CNPJ do emitente
                // não dá pra aprender (não teria como identificar o
                // fornecedor da próxima vez).
                const descricaoItem = parsed.itens[linha.itemIndex]?.descricao;
                if (incoming.issuerCnpj && descricaoItem && descricaoItem.trim()) {
                    const descricaoChave = normalizarNome(descricaoItem);

                    await tx.stockSupplierItemMapping.upsert({
                        where: {
                            storeId_issuerCnpj_descricaoChave: {
                                storeId: incoming.storeId,
                                issuerCnpj: incoming.issuerCnpj,
                                descricaoChave,
                            },
                        },
                        update: { stockItemId: stockItem.id },
                        create: {
                            storeId: incoming.storeId,
                            issuerCnpj: incoming.issuerCnpj,
                            descricaoChave,
                            stockItemId: stockItem.id,
                        },
                    });
                }
            }

            await tx.incomingGoodsNf.update({
                where: { id: incomingNfId },
                data: { stockLinkedAt: new Date() },
            });
        });

        return { vinculados: dto.itens.length };
    }

    // ---------------------------------------------------------------
    // Vínculo de itens de compra sem NF — Fluxo 2 (nunca vai ter NF real,
    // só descrição/foto do cupom, obrigatórias na hora de gerar a conta —
    // ver Purchase.noInvoiceProductsNote e bills.service.ts). Sem XML pra
    // ler, então os itens são digitados manualmente aqui.
    // ---------------------------------------------------------------

    // Compras que já geraram conta a pagar, não têm NF real (tipo
    // INVOICE) vinculada — só cupom (COUPON) ou nada — e ainda não
    // tiveram os itens ligados ao estoque.
    async listComprasPendentes(user: any, storeId: string) {
        this.ensureStoreAccess(storeId, user);

        const purchases = await this.prisma.purchase.findMany({
            where: {
                storeId,
                stockLinkedAt: null,
                bills: { some: {} },
                fiscalDocuments: { none: { type: 'INVOICE', status: 'LINKED' } },
            },
            orderBy: { purchasedAt: 'desc' },
            select: {
                id: true,
                description: true,
                value: true,
                purchasedAt: true,
                noInvoiceProductsNote: true,
                supplier: { select: { name: true } },
                fiscalDocuments: {
                    where: { type: 'COUPON', status: 'LINKED' },
                    select: { id: true, fileUrl: true },
                    take: 1,
                },
            },
            take: 100,
        });

        return purchases.map((p) => ({
            id: p.id,
            description: p.description,
            value: p.value,
            purchasedAt: p.purchasedAt,
            supplierName: p.supplier?.name ?? null,
            noInvoiceProductsNote: p.noInvoiceProductsNote,
            couponUrl: p.fiscalDocuments[0]?.fileUrl ?? null,
        }));
    }

    // Detalhe da compra pra montar a tela de vínculo manual — descrição,
    // foto do cupom (se tiver) e o que já foi vinculado antes (reabrir
    // pra editar), já que não existe lista de itens vinda de XML.
    async getCompraItensParaVinculo(purchaseId: string, user: any) {
        const purchase = await this.prisma.purchase.findUnique({
            where: { id: purchaseId },
            include: {
                supplier: { select: { name: true } },
                fiscalDocuments: {
                    where: { type: 'COUPON', status: 'LINKED' },
                    select: { id: true, fileUrl: true },
                    take: 1,
                },
                bills: { select: { id: true }, take: 1 },
            },
        });

        if (!purchase) throw new NotFoundException('Compra não encontrada.');
        this.ensureStoreAccess(purchase.storeId, user);

        if (purchase.bills.length === 0) {
            throw new BadRequestException(
                'Essa compra ainda não tem conta a pagar gerada.',
            );
        }

        const jaVinculados = await this.prisma.stockMovement.findMany({
            where: { storeId: purchase.storeId, sourceRef: { startsWith: `compra:${purchaseId}:item:` } },
            include: { stockItem: { select: { id: true, nome: true } } },
            orderBy: { sourceRef: 'asc' },
        });

        return {
            description: purchase.description,
            value: purchase.value,
            purchasedAt: purchase.purchasedAt,
            supplierName: purchase.supplier?.name ?? null,
            noInvoiceProductsNote: purchase.noInvoiceProductsNote,
            couponUrl: purchase.fiscalDocuments[0]?.fileUrl ?? null,
            stockLinkedAt: purchase.stockLinkedAt,
            itensVinculados: jaVinculados.map((mov) => ({
                stockItemId: mov.stockItem.id,
                stockItemNome: mov.stockItem.nome,
                quantidade: Number(mov.quantidade),
                valorTotal: mov.valorTotal ? Number(mov.valorTotal) : null,
            })),
        };
    }

    async vincularCompraAoEstoque(purchaseId: string, dto: LinkPurchaseItemsDto, user: any) {
        const purchase = await this.prisma.purchase.findUnique({
            where: { id: purchaseId },
            include: { bills: { select: { id: true }, take: 1 } },
        });

        if (!purchase) throw new NotFoundException('Compra não encontrada.');
        this.ensureStoreAccess(purchase.storeId, user);

        if (purchase.bills.length === 0) {
            throw new BadRequestException(
                'Essa compra ainda não tem conta a pagar gerada.',
            );
        }

        await this.prisma.$transaction(async (tx) => {
            for (let index = 0; index < dto.itens.length; index++) {
                const linha = dto.itens[index];

                const stockItem = await this.resolveOrCreateStockItem(tx, {
                    storeId: purchase.storeId,
                    stockItemId: linha.stockItemId,
                    novoNome: linha.novoNome,
                    novaCategoria: linha.novaCategoria,
                    novaUnidadeMedida: linha.novaUnidadeMedida,
                });

                await this.applyMovement(tx, {
                    storeId: purchase.storeId,
                    stockItemId: stockItem.id,
                    tipo: StockMovementType.ENTRADA,
                    origem: StockMovementOrigin.COMPRA_SEM_NF,
                    quantidade: linha.quantidade,
                    valorTotal: linha.valorTotal ?? null,
                    sourceRef: `compra:${purchaseId}:item:${index}`,
                    data: purchase.purchasedAt ?? new Date(),
                    createdById: user.id,
                });
            }

            await tx.purchase.update({
                where: { id: purchaseId },
                data: { stockLinkedAt: new Date() },
            });
        });

        return { vinculados: dto.itens.length };
    }

    // ---------------------------------------------------------------
    // Importação por planilha modelo (Nome / Descrição / Categoria /
    // Quantidade / Valor / Mínimo / Máximo). Categoria é sempre uma das
    // ESTOQUE_CATEGORIAS (Hortifruti/Matéria Prima/Revenda/Embalagens/
    // Limpeza/Ativo) — Descrição é livre, uma classificação mais fina só
    // pra organização (ex: "Proteínas - Frigorífico", "Bebidas - Whisky
    // e Gin"). Mínimo/Máximo alimentam a sugestão de compra (ver
    // serializeItem/listaCompra).
    // ---------------------------------------------------------------

    async gerarModeloPlanilha(storeId: string, user: any): Promise<Buffer> {
        if (!storeId) {
            throw new BadRequestException('Selecione uma loja ativa no topo do sistema.');
        }

        this.ensureStoreAccess(storeId, user);

        const itensExistentes = await this.prisma.stockItem.findMany({
            where: { storeId },
            orderBy: { nome: 'asc' },
        });

        const linhas: (string | number)[][] = [
            ['Nome', 'Descrição', 'Categoria', 'Quantidade', 'Valor', 'Mínimo', 'Máximo'],
        ];

        if (itensExistentes.length === 0) {
            // Loja sem nenhum item cadastrado ainda — mantém a linha de
            // exemplo, senão a planilha sai só com o cabeçalho e ninguém
            // entende o formato esperado.
            linhas.push([
                'Picanha',
                'Proteínas - Frigorífico',
                ESTOQUE_CATEGORIAS[1],
                '',
                '',
                '',
                '',
            ]);
        } else {
            // Já tem itens: a planilha nasce com Nome/Descrição/Categoria
            // já preenchidos (Quantidade/Valor em branco de propósito —
            // reimportar com Quantidade preenchida LANÇA UMA ENTRADA, soma
            // no saldo atual; deixar em branco evita duplicar estoque sem
            // querer). Mínimo/Máximo vêm com o valor atual, pra editar em
            // massa sem perder o que já estava configurado.
            for (const item of itensExistentes) {
                linhas.push([
                    item.nome,
                    item.descricao || '',
                    item.categoria || '',
                    '',
                    '',
                    item.estoqueMinimo != null ? Number(item.estoqueMinimo) : '',
                    item.estoqueMaximo != null ? Number(item.estoqueMaximo) : '',
                ]);
            }
        }

        const worksheet = XLSX.utils.aoa_to_sheet(linhas);
        worksheet['!cols'] = [
            { wch: 32 },
            { wch: 30 },
            { wch: 16 },
            { wch: 14 },
            { wch: 14 },
            { wch: 12 },
            { wch: 12 },
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Estoque');

        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    // Nome é o único campo obrigatório — Descrição/Categoria/Quantidade/
    // Valor/Mínimo/Máximo ficam em branco à vontade. Nome cadastra/
    // atualiza o item; Quantidade (se vier) já lança uma ENTRADA — soma
    // no saldo atual, nunca substitui (reimportar a mesma planilha soma
    // de novo). Mínimo/Máximo sempre SUBSTITUEM o valor atual do item
    // quando vêm preenchidos (não somam) — é configuração, não saldo.
    async importarPlanilha(storeId: string, file: Express.Multer.File, user: any) {
        if (!storeId) {
            throw new BadRequestException('Selecione uma loja ativa no topo do sistema.');
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
        if (!sheet) throw new BadRequestException('A planilha não tem nenhuma aba.');

        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            raw: true,
            defval: null,
        });

        type LinhaPlanilha = {
            nome: string;
            descricao: string | null;
            categoria: string | null;
            quantidade: number | null;
            valor: number | null;
            estoqueMinimo: number | null;
            estoqueMaximo: number | null;
        };

        const linhas: LinhaPlanilha[] = [];

        for (let i = 1; i < rows.length; i++) {
            const linha = rows[i];
            if (!linha) continue;

            const nomeCelula = linha[0];
            if (nomeCelula == null || String(nomeCelula).trim() === '') continue;

            linhas.push({
                nome: String(nomeCelula).trim(),
                descricao: linha[1] != null && String(linha[1]).trim() !== '' ? String(linha[1]).trim() : null,
                categoria: linha[2] != null && String(linha[2]).trim() !== '' ? String(linha[2]).trim() : null,
                quantidade: parseNumeroCell(linha[3]),
                valor: parseNumeroCell(linha[4]),
                estoqueMinimo: parseNumeroCell(linha[5]),
                estoqueMaximo: parseNumeroCell(linha[6]),
            });
        }

        if (linhas.length === 0) {
            throw new BadRequestException(
                'Não encontrei nenhuma linha válida a partir da linha 2 (coluna A = Nome).',
            );
        }

        let criados = 0;
        let atualizados = 0;
        let entradasLancadas = 0;

        await this.prisma.$transaction(async (tx) => {
            for (const linha of linhas) {
                const nomeChave = normalizarNome(linha.nome);

                const existing = await tx.stockItem.findUnique({
                    where: { storeId_nomeChave: { storeId, nomeChave } },
                });

                let stockItem;

                if (existing) {
                    const data: Prisma.StockItemUpdateInput = {};
                    if (linha.categoria) data.categoria = linha.categoria;
                    if (linha.descricao) data.descricao = linha.descricao;
                    if (linha.estoqueMinimo != null) data.estoqueMinimo = linha.estoqueMinimo;
                    if (linha.estoqueMaximo != null) data.estoqueMaximo = linha.estoqueMaximo;

                    stockItem = Object.keys(data).length > 0
                        ? await tx.stockItem.update({ where: { id: existing.id }, data })
                        : existing;
                    atualizados += 1;
                } else {
                    stockItem = await tx.stockItem.create({
                        data: {
                            storeId,
                            nome: linha.nome,
                            nomeChave,
                            descricao: linha.descricao,
                            categoria: linha.categoria,
                            estoqueMinimo: linha.estoqueMinimo,
                            estoqueMaximo: linha.estoqueMaximo,
                        },
                    });
                    criados += 1;
                }

                if (linha.quantidade && linha.quantidade > 0) {
                    await this.applyMovement(tx, {
                        storeId,
                        stockItemId: stockItem.id,
                        tipo: StockMovementType.ENTRADA,
                        origem: StockMovementOrigin.IMPORTACAO_PLANILHA,
                        quantidade: linha.quantidade,
                        valorTotal: linha.valor ?? null,
                        createdById: user.id,
                    });
                    entradasLancadas += 1;
                }
            }
        });

        return { totalLinhas: linhas.length, criados, atualizados, entradasLancadas };
    }

    // ---------------------------------------------------------------
    // Baixa automática — escuta a importação de vendas (aba Produtos)
    // ---------------------------------------------------------------

    // Reage a toda nova planilha de vendas importada em Produtos: soma o
    // consumo de cada item de estoque NAQUELA importação (mesma conta de
    // ProductSalesService.ingredientsSummary, mas restrita a um único
    // productSalesImportId) e desconta direto do StockItem — a ficha
    // técnica (ProductRecipeItem) já aponta pro StockItem real, sem
    // precisar de nenhum vínculo indireto. Prato sem ficha técnica
    // simplesmente não é tocado — segue só manual/NF. Deixa saldo
    // negativo se faltar (sem travar), como decidido.
    @OnEvent(PRODUCT_SALES_IMPORTED_EVENT)
    async aplicarBaixaAutomatica(event: ProductSalesImportedEvent) {
        const consumo = await this.calcularConsumoPorImportacao(
            event.storeId,
            event.productSalesImportId,
        );

        if (consumo.size === 0) return;

        await this.prisma.$transaction(async (tx) => {
            for (const [stockItemId, quantidade] of consumo.entries()) {
                if (!quantidade || quantidade <= 0) continue;

                await this.applyMovement(tx, {
                    storeId: event.storeId,
                    stockItemId,
                    tipo: StockMovementType.SAIDA,
                    origem: StockMovementOrigin.CONSUMO_VENDA,
                    quantidade,
                    sourceRef: `venda:${event.productSalesImportId}:item:${stockItemId}`,
                });
            }
        });
    }

    // Mesma lógica de ProductSalesService.ingredientsSummary, só que
    // restrita a UMA importação (não um período) — devolve
    // Map<stockItemId, quantidadeConsumida>. Fica aqui (não
    // reaproveitada de lá) pra não criar dependência de EstoqueModule
    // em cima de ProductSalesModule; os dois só se falam pelo evento
    // (ver src/common/events.ts). Só as linhas de ficha técnica ligadas
    // DIRETO a um StockItem — as ligadas a um ProductionItem (aba
    // Produção, repasse pro Estoque bruto) são tratadas à parte, em
    // ProductionService.aplicarBaixaAutomatica.
    private async calcularConsumoPorImportacao(storeId: string, importId: string) {
        const [entries, recipeItems] = await Promise.all([
            this.prisma.productSalesEntry.findMany({
                where: { importId },
                select: { produtoChave: true, quantidade: true },
            }),
            this.prisma.productRecipeItem.findMany({
                where: { storeId, stockItemId: { not: null } },
                select: {
                    produtoChave: true,
                    stockItemId: true,
                    gramas: true,
                    stockItem: { select: { unidadeMedida: true } },
                },
            }),
        ]);

        const quantidadePorProduto = new Map<string, number>();
        for (const entry of entries) {
            const atual = quantidadePorProduto.get(entry.produtoChave) || 0;
            quantidadePorProduto.set(entry.produtoChave, atual + Number(entry.quantidade));
        }

        const consumoPorStockItem = new Map<string, number>();

        for (const item of recipeItems) {
            if (!item.stockItemId || !item.stockItem) continue;

            const vendido = quantidadePorProduto.get(item.produtoChave);
            if (!vendido || vendido <= 0) continue;

            const gramas = Number(item.gramas);
            const quantidade =
                item.stockItem.unidadeMedida === 'UNIDADE'
                    ? vendido * gramas
                    : (vendido * gramas) / 1000;

            consumoPorStockItem.set(
                item.stockItemId,
                (consumoPorStockItem.get(item.stockItemId) || 0) + quantidade,
            );
        }

        return consumoPorStockItem;
    }
}
