import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
    Prisma,
    ProductionMovementType,
    ProductionUnidade,
    StockMovementOrigin,
    StockMovementType,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
    PRODUCT_SALES_IMPORTED_EVENT,
    type ProductSalesImportedEvent,
} from '../common/events';
import { CreateProductionItemDto } from './dto/create-production-item.dto';
import { UpdateProductionItemDto } from './dto/update-production-item.dto';
import { ProduzirDto } from './dto/produzir.dto';

// Mesmo normalizador usado em product-sales.service.ts/estoque.service.ts
// — cópia local pra não acoplar módulos.
function normalizarNome(nome: string): string {
    return nome.toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

@Injectable()
export class ProductionService {
    constructor(private prisma: PrismaService) {}

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
    // Catálogo (ProductionItem)
    // ---------------------------------------------------------------

    async listItems(user: any, storeId: string) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        const items = await this.prisma.productionItem.findMany({
            where: { storeId, active: true },
            include: {
                recipeItems: {
                    include: { stockItem: { select: { id: true, nome: true, unidadeMedida: true } } },
                },
            },
            orderBy: { nome: 'asc' },
        });

        return items.map((item) => ({
            id: item.id,
            nome: item.nome,
            unidadeMedida: item.unidadeMedida,
            baseQuantidade: Number(item.baseQuantidade),
            quantidadeAtual: Number(item.quantidadeAtual),
            receita: item.recipeItems.map((r) => ({
                id: r.id,
                stockItemId: r.stockItemId,
                stockItemNome: r.stockItem.nome,
                stockItemUnidade: r.stockItem.unidadeMedida,
                quantidade: Number(r.quantidade),
            })),
        }));
    }

    async getItem(id: string, user: any) {
        const item = await this.prisma.productionItem.findUnique({
            where: { id },
            include: {
                recipeItems: {
                    include: { stockItem: { select: { id: true, nome: true, unidadeMedida: true } } },
                },
            },
        });

        if (!item) throw new NotFoundException('Item de produção não encontrado.');

        this.ensureStoreAccess(item.storeId, user);

        return {
            id: item.id,
            nome: item.nome,
            unidadeMedida: item.unidadeMedida,
            baseQuantidade: Number(item.baseQuantidade),
            quantidadeAtual: Number(item.quantidadeAtual),
            receita: item.recipeItems.map((r) => ({
                id: r.id,
                stockItemId: r.stockItemId,
                stockItemNome: r.stockItem.nome,
                stockItemUnidade: r.stockItem.unidadeMedida,
                quantidade: Number(r.quantidade),
            })),
        };
    }

    async createItem(dto: CreateProductionItemDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const nomeChave = normalizarNome(dto.nome);

        const existing = await this.prisma.productionItem.findUnique({
            where: { storeId_nomeChave: { storeId: dto.storeId, nomeChave } },
        });

        if (existing) {
            throw new BadRequestException('Já existe um item de produção com esse nome.');
        }

        await this.assertReceitaValida(dto.storeId, dto.receita);

        const item = await this.prisma.$transaction(async (tx) => {
            const created = await tx.productionItem.create({
                data: {
                    storeId: dto.storeId,
                    nome: dto.nome.trim(),
                    nomeChave,
                    unidadeMedida: (dto.unidadeMedida as ProductionUnidade) || 'KG',
                    baseQuantidade: dto.baseQuantidade ?? 1,
                },
            });

            if (dto.receita?.length) {
                await tx.productionRecipeItem.createMany({
                    data: dto.receita.map((c) => ({
                        productionItemId: created.id,
                        stockItemId: c.stockItemId,
                        quantidade: c.quantidade,
                    })),
                });
            }

            return created;
        });

        return this.getItem(item.id, user);
    }

    async updateItem(id: string, dto: UpdateProductionItemDto, user: any) {
        const item = await this.prisma.productionItem.findUnique({ where: { id } });
        if (!item) throw new NotFoundException('Item de produção não encontrado.');

        this.ensureStoreAccess(item.storeId, user);

        if (dto.receita) {
            await this.assertReceitaValida(item.storeId, dto.receita);
        }

        const data: Prisma.ProductionItemUpdateInput = {};

        if (dto.nome !== undefined) {
            data.nome = dto.nome.trim();
            data.nomeChave = normalizarNome(dto.nome);
        }
        if (dto.unidadeMedida !== undefined) {
            data.unidadeMedida = dto.unidadeMedida as ProductionUnidade;
        }
        if (dto.baseQuantidade !== undefined) {
            data.baseQuantidade = dto.baseQuantidade;
        }

        await this.prisma.$transaction(async (tx) => {
            if (Object.keys(data).length > 0) {
                await tx.productionItem.update({ where: { id }, data });
            }

            if (dto.receita) {
                await tx.productionRecipeItem.deleteMany({ where: { productionItemId: id } });

                if (dto.receita.length) {
                    await tx.productionRecipeItem.createMany({
                        data: dto.receita.map((c) => ({
                            productionItemId: id,
                            stockItemId: c.stockItemId,
                            quantidade: c.quantidade,
                        })),
                    });
                }
            }
        });

        return this.getItem(id, user);
    }

    async removeItem(id: string, user: any) {
        const item = await this.prisma.productionItem.findUnique({ where: { id } });
        if (!item) throw new NotFoundException('Item de produção não encontrado.');

        this.ensureStoreAccess(item.storeId, user);

        // Soft delete — um item de produção já pode estar referenciado por
        // fichas técnicas de pratos (ProductRecipeItem); apagar de vez
        // quebraria a baixa por venda desses pratos.
        await this.prisma.productionItem.update({
            where: { id },
            data: { active: false },
        });

        return { ok: true };
    }

    private async assertReceitaValida(
        storeId: string,
        receita?: { stockItemId: string; quantidade: number }[],
    ) {
        if (!receita?.length) return;

        const ids = receita.map((c) => c.stockItemId);
        const stockItems = await this.prisma.stockItem.findMany({
            where: { id: { in: ids }, storeId },
            select: { id: true },
        });

        if (stockItems.length !== new Set(ids).size) {
            throw new BadRequestException(
                'Um ou mais itens de estoque da receita não foram encontrados nesta loja.',
            );
        }
    }

    // ---------------------------------------------------------------
    // Produzir — "hoje eu porcionei/produzi X"
    // ---------------------------------------------------------------

    async produzir(id: string, dto: ProduzirDto, user: any) {
        const item = await this.prisma.productionItem.findUnique({
            where: { id },
            include: { recipeItems: { include: { stockItem: true } } },
        });

        if (!item) throw new NotFoundException('Item de produção não encontrado.');

        this.ensureStoreAccess(item.storeId, user);

        if (item.recipeItems.length === 0) {
            throw new BadRequestException(
                'Este item de produção ainda não tem receita cadastrada (quais itens do estoque ele usa).',
            );
        }

        const fator = dto.quantidade / Number(item.baseQuantidade);

        await this.prisma.$transaction(async (tx) => {
            // Abate proporcional de cada componente da receita no Estoque.
            for (const componente of item.recipeItems) {
                const quantidadeConsumida = Number(componente.quantidade) * fator;

                await tx.stockMovement.create({
                    data: {
                        storeId: item.storeId,
                        stockItemId: componente.stockItemId,
                        tipo: StockMovementType.SAIDA,
                        origem: StockMovementOrigin.MANUAL,
                        quantidade: quantidadeConsumida,
                        observacao: `Produção de ${dto.quantidade} ${item.unidadeMedida} de "${item.nome}"`,
                        createdById: user.id,
                    },
                });

                await tx.stockItem.update({
                    where: { id: componente.stockItemId },
                    data: { quantidadeAtual: { decrement: quantidadeConsumida } },
                });
            }

            // Credita o estoque de Produção do próprio item.
            await tx.productionMovement.create({
                data: {
                    storeId: item.storeId,
                    productionItemId: item.id,
                    tipo: ProductionMovementType.PRODUCAO,
                    quantidade: dto.quantidade,
                    observacao: dto.observacao || null,
                    createdById: user.id,
                },
            });

            await tx.productionItem.update({
                where: { id: item.id },
                data: { quantidadeAtual: { increment: dto.quantidade } },
            });
        });

        return this.getItem(id, user);
    }

    async listMovements(
        user: any,
        params: { storeId: string; productionItemId?: string; page?: number; pageSize?: number },
    ) {
        if (!params.storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(params.storeId, user);

        const page = params.page && params.page > 0 ? params.page : 1;
        const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 30;

        const where: Prisma.ProductionMovementWhereInput = { storeId: params.storeId };
        if (params.productionItemId) where.productionItemId = params.productionItemId;

        const [total, movements] = await Promise.all([
            this.prisma.productionMovement.count({ where }),
            this.prisma.productionMovement.findMany({
                where,
                include: { productionItem: { select: { nome: true, unidadeMedida: true } } },
                orderBy: { data: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);

        return {
            total,
            page,
            pageSize,
            items: movements.map((m) => ({
                id: m.id,
                productionItemId: m.productionItemId,
                productionItemNome: m.productionItem.nome,
                unidadeMedida: m.productionItem.unidadeMedida,
                tipo: m.tipo,
                quantidade: Number(m.quantidade),
                observacao: m.observacao,
                data: m.data,
            })),
        };
    }

    // ---------------------------------------------------------------
    // Baixa automática — escuta a mesma importação de vendas que o
    // Estoque escuta (ver EstoqueService.aplicarBaixaAutomatica). Cada
    // módulo processa só a parte que lhe cabe: Estoque desconta
    // ProductRecipeItem.stockItemId, Produção desconta
    // ProductRecipeItem.productionItemId — nunca cascateia daqui pro
    // Estoque bruto (isso já aconteceu na hora de produzir).
    // ---------------------------------------------------------------

    @OnEvent(PRODUCT_SALES_IMPORTED_EVENT)
    async aplicarBaixaAutomatica(event: ProductSalesImportedEvent) {
        const [entries, recipeItems] = await Promise.all([
            this.prisma.productSalesEntry.findMany({
                where: { importId: event.productSalesImportId },
                select: { produtoChave: true, quantidade: true },
            }),
            this.prisma.productRecipeItem.findMany({
                where: { storeId: event.storeId, productionItemId: { not: null } },
                select: {
                    produtoChave: true,
                    productionItemId: true,
                    gramas: true,
                },
            }),
        ]);

        if (recipeItems.length === 0) return;

        const quantidadePorProduto = new Map<string, number>();
        for (const entry of entries) {
            const atual = quantidadePorProduto.get(entry.produtoChave) || 0;
            quantidadePorProduto.set(entry.produtoChave, atual + Number(entry.quantidade));
        }

        const consumoPorItem = new Map<string, number>();
        for (const item of recipeItems) {
            const vendido = quantidadePorProduto.get(item.produtoChave);
            if (!vendido || vendido <= 0) continue;
            if (!item.productionItemId) continue;

            const quantidade = vendido * Number(item.gramas);
            consumoPorItem.set(
                item.productionItemId,
                (consumoPorItem.get(item.productionItemId) || 0) + quantidade,
            );
        }

        if (consumoPorItem.size === 0) return;

        await this.prisma.$transaction(async (tx) => {
            for (const [productionItemId, quantidade] of consumoPorItem) {
                if (quantidade <= 0) continue;

                const sourceRef = `venda:${event.productSalesImportId}:production:${productionItemId}`;

                const existing = await tx.productionMovement.findUnique({
                    where: { storeId_sourceRef: { storeId: event.storeId, sourceRef } },
                });

                if (existing) {
                    const delta = quantidade - Number(existing.quantidade);
                    if (delta === 0) continue;

                    await tx.productionMovement.update({
                        where: { id: existing.id },
                        data: { quantidade },
                    });
                    await tx.productionItem.update({
                        where: { id: productionItemId },
                        data: { quantidadeAtual: { decrement: delta } },
                    });
                    continue;
                }

                await tx.productionMovement.create({
                    data: {
                        storeId: event.storeId,
                        productionItemId,
                        tipo: ProductionMovementType.CONSUMO_VENDA,
                        quantidade,
                        sourceRef,
                    },
                });

                await tx.productionItem.update({
                    where: { id: productionItemId },
                    data: { quantidadeAtual: { decrement: quantidade } },
                });
            }
        });
    }
}
