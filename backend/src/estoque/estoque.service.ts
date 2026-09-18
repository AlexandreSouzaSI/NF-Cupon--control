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
        params: { storeId: string; categoria?: string; search?: string; onlyNegative?: boolean },
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
        if (params.search) {
            where.nomeChave = { contains: normalizarNome(params.search) };
        }
        if (params.onlyNegative) {
            where.quantidadeAtual = { lt: 0 };
        }

        const items = await this.prisma.stockItem.findMany({
            where,
            include: { ingredient: { select: { id: true, nome: true } } },
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
        const abaixoDoMinimo = estoqueMinimo != null && quantidadeAtual < estoqueMinimo;

        return {
            id: item.id,
            nome: item.nome,
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
            abaixoDoMinimo,
            quantidadeSugerida: abaixoDoMinimo ? estoqueMinimo! - quantidadeAtual : 0,
            ingredientId: item.ingredientId,
            ingredienteNome: item.ingredient?.nome ?? null,
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
            include: { ingredient: { select: { id: true, nome: true } } },
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

    async createItem(dto: CreateStockItemDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const nomeChave = normalizarNome(dto.nome);

        const existing = await this.prisma.stockItem.findUnique({
            where: { storeId_nomeChave: { storeId: dto.storeId, nomeChave } },
        });

        if (existing) {
            throw new BadRequestException('Já existe um item de estoque com esse nome.');
        }

        if (dto.ingredientId) {
            await this.assertIngredientLivre(dto.storeId, dto.ingredientId);
        }

        const item = await this.prisma.stockItem.create({
            data: {
                storeId: dto.storeId,
                nome: dto.nome.trim(),
                nomeChave,
                categoria: dto.categoria?.trim() || null,
                unidadeMedida: (dto.unidadeMedida as IngredientUnidade) || 'KG',
                ingredientId: dto.ingredientId || null,
                estoqueMinimo: dto.estoqueMinimo ?? null,
            },
            include: { ingredient: { select: { id: true, nome: true } } },
        });

        return this.serializeItem(item);
    }

    private async assertIngredientLivre(storeId: string, ingredientId: string, ignoreStockItemId?: string) {
        const ingredient = await this.prisma.ingredient.findUnique({
            where: { id: ingredientId },
            include: { stockItem: true },
        });

        if (!ingredient || ingredient.storeId !== storeId) {
            throw new BadRequestException('Ingrediente não encontrado nessa loja.');
        }

        if (ingredient.stockItem && ingredient.stockItem.id !== ignoreStockItemId) {
            throw new BadRequestException(
                `O ingrediente "${ingredient.nome}" já está vinculado a outro item de estoque.`,
            );
        }
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
        if (dto.categoria !== undefined) data.categoria = dto.categoria?.trim() || null;
        if (dto.unidadeMedida !== undefined) data.unidadeMedida = dto.unidadeMedida as IngredientUnidade;
        if (dto.active !== undefined) data.active = dto.active;
        if (dto.estoqueMinimo !== undefined) data.estoqueMinimo = dto.estoqueMinimo;

        if (dto.ingredientId !== undefined) {
            if (dto.ingredientId) {
                await this.assertIngredientLivre(item.storeId, dto.ingredientId, item.id);
                data.ingredient = { connect: { id: dto.ingredientId } };
            } else {
                data.ingredient = { disconnect: true };
            }
        }

        const updated = await this.prisma.stockItem.update({
            where: { id },
            data,
            include: { ingredient: { select: { id: true, nome: true } } },
        });

        return this.serializeItem(updated);
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
            include: { ingredient: { select: { id: true, nome: true } } },
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
            novaUnidadeMedida?: 'KG' | 'UNIDADE';
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
    // Importação por planilha modelo (Nome / Categoria / Quantidade / Valor)
    // ---------------------------------------------------------------

    async gerarModeloPlanilha(): Promise<Buffer> {
        const linhas = [['Nome', 'Categoria', 'Quantidade', 'Valor']];

        const worksheet = XLSX.utils.aoa_to_sheet(linhas);
        worksheet['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Estoque');

        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    // Nome é o único campo obrigatório — Categoria/Quantidade/Valor
    // ficam em branco à vontade. Nome cadastra/atualiza o item;
    // Quantidade (se vier) já lança uma ENTRADA — soma no saldo atual,
    // nunca substitui (reimportar a mesma planilha soma de novo).
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
            categoria: string | null;
            quantidade: number | null;
            valor: number | null;
        };

        const linhas: LinhaPlanilha[] = [];

        for (let i = 1; i < rows.length; i++) {
            const linha = rows[i];
            if (!linha) continue;

            const nomeCelula = linha[0];
            if (nomeCelula == null || String(nomeCelula).trim() === '') continue;

            linhas.push({
                nome: String(nomeCelula).trim(),
                categoria: linha[1] != null && String(linha[1]).trim() !== '' ? String(linha[1]).trim() : null,
                quantidade: parseNumeroCell(linha[2]),
                valor: parseNumeroCell(linha[3]),
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
                    stockItem = linha.categoria
                        ? await tx.stockItem.update({
                            where: { id: existing.id },
                            data: { categoria: linha.categoria },
                        })
                        : existing;
                    atualizados += 1;
                } else {
                    stockItem = await tx.stockItem.create({
                        data: {
                            storeId,
                            nome: linha.nome,
                            nomeChave,
                            categoria: linha.categoria,
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
    // consumo de cada ingrediente NAQUELA importação (mesma conta de
    // ingredientsSummary, mas restrita a um único productSalesImportId)
    // e desconta do StockItem vinculado a cada ingrediente. Item sem
    // vínculo simplesmente não é tocado — segue só manual/NF. Deixa
    // saldo negativo se faltar (sem travar), como decidido.
    @OnEvent(PRODUCT_SALES_IMPORTED_EVENT)
    async aplicarBaixaAutomatica(event: ProductSalesImportedEvent) {
        const consumo = await this.calcularConsumoPorImportacao(
            event.storeId,
            event.productSalesImportId,
        );

        if (consumo.size === 0) return;

        const stockItems = await this.prisma.stockItem.findMany({
            where: { storeId: event.storeId, ingredientId: { in: Array.from(consumo.keys()) } },
        });

        if (stockItems.length === 0) return;

        await this.prisma.$transaction(async (tx) => {
            for (const stockItem of stockItems) {
                const quantidade = consumo.get(stockItem.ingredientId as string);
                if (!quantidade || quantidade <= 0) continue;

                await this.applyMovement(tx, {
                    storeId: event.storeId,
                    stockItemId: stockItem.id,
                    tipo: StockMovementType.SAIDA,
                    origem: StockMovementOrigin.CONSUMO_VENDA,
                    quantidade,
                    sourceRef: `venda:${event.productSalesImportId}:item:${stockItem.id}`,
                });
            }
        });
    }

    // Mesma lógica de ProductSalesService.ingredientsSummary, só que
    // restrita a UMA importação (não um período) — devolve
    // Map<ingredientId, quantidadeConsumida>. Fica aqui (não
    // reaproveitada de lá) pra não criar dependência de EstoqueModule
    // em cima de ProductSalesModule; os dois só se falam pelo evento
    // (ver src/common/events.ts).
    private async calcularConsumoPorImportacao(storeId: string, importId: string) {
        const [entries, recipeItems] = await Promise.all([
            this.prisma.productSalesEntry.findMany({
                where: { importId },
                select: { produtoChave: true, quantidade: true },
            }),
            this.prisma.productRecipeItem.findMany({
                where: { storeId },
                select: {
                    produtoChave: true,
                    ingredientId: true,
                    gramas: true,
                    ingredient: { select: { unidadeMedida: true } },
                },
            }),
        ]);

        const quantidadePorProduto = new Map<string, number>();
        for (const entry of entries) {
            const atual = quantidadePorProduto.get(entry.produtoChave) || 0;
            quantidadePorProduto.set(entry.produtoChave, atual + Number(entry.quantidade));
        }

        const consumoPorIngrediente = new Map<string, number>();

        for (const item of recipeItems) {
            const vendido = quantidadePorProduto.get(item.produtoChave);
            if (!vendido || vendido <= 0) continue;

            const gramas = Number(item.gramas);
            const quantidade =
                item.ingredient.unidadeMedida === 'UNIDADE'
                    ? vendido * gramas
                    : (vendido * gramas) / 1000;

            consumoPorIngrediente.set(
                item.ingredientId,
                (consumoPorIngrediente.get(item.ingredientId) || 0) + quantidade,
            );
        }

        return consumoPorIngrediente;
    }
}
