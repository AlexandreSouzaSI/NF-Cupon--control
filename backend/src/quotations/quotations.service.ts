import { randomBytes } from 'crypto';

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    NotificationType,
    PaymentMethod,
    Prisma,
    PurchaseCategory,
    PurchaseOrigin,
    PurchaseStatus,
    QuotationStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
    QUOTATION_ORDER_CONFIRM_REQUESTED_EVENT,
    QUOTATION_SUPPLIER_INVITED_EVENT,
} from '../common/events';
import type {
    QuotationOrderConfirmRequestedEvent,
    QuotationSupplierInvitedEvent,
} from '../common/events';
import { CreateScheduleEntryDto } from './dto/create-schedule-entry.dto';
import { CreateCategoryItemDto } from './dto/create-category-item.dto';
import { UpdateCategoryItemDto } from './dto/update-category-item.dto';
import { SendQuotationDto } from './dto/send-quotation.dto';
import { SubmitQuotationPricesDto } from './dto/submit-quotation-prices.dto';
import { SelectSupplierDto } from './dto/select-supplier.dto';

// Mesma lista de perfis que recebem notificação de evento de Compras
// (ver PURCHASE_NOTIFY_ROLES em purchases.service.ts) — Administrativo/
// Proprietário já são cobertos automaticamente pelo notifyStoreAccess.
const PURCHASE_NOTIFY_ROLES: UserRole[] = [
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.ESTOQUISTA,
];

// Nomes dos dias — mesmo padrão de Date.getDay() usado no schema
// (QuotationScheduleEntry.diaSemana): 0 = domingo ... 6 = sábado.
export const DIAS_SEMANA = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
];

@Injectable()
export class QuotationsService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2,
        private notificationsService: NotificationsService,
    ) { }

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
    // Agenda fixa (QuotationScheduleEntry)
    // ---------------------------------------------------------------

    // Lista a agenda inteira da loja, uma linha por (dia, categoria) —
    // o frontend agrupa por diaSemana pra desenhar os 7 dias.
    async listSchedule(user: any, storeId: string) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        return this.prisma.quotationScheduleEntry.findMany({
            where: { storeId },
            include: { category: true },
            orderBy: [{ diaSemana: 'asc' }, { category: { name: 'asc' } }],
        });
    }

    async createScheduleEntry(dto: CreateScheduleEntryDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const category = await this.prisma.supplierCategory.findUnique({
            where: { id: dto.categoryId },
        });

        if (!category) {
            throw new NotFoundException('Categoria não encontrada.');
        }

        try {
            return await this.prisma.quotationScheduleEntry.create({
                data: {
                    storeId: dto.storeId,
                    diaSemana: dto.diaSemana,
                    categoryId: dto.categoryId,
                },
                include: { category: true },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'Essa categoria já está na agenda desse dia.',
                );
            }

            throw error;
        }
    }

    async removeScheduleEntry(id: string, user: any) {
        const entry = await this.prisma.quotationScheduleEntry.findUnique({
            where: { id },
        });

        if (!entry) {
            throw new NotFoundException('Entrada da agenda não encontrada.');
        }

        this.ensureStoreAccess(entry.storeId, user);

        await this.prisma.quotationScheduleEntry.delete({ where: { id } });

        return { ok: true };
    }

    // Agenda de hoje (Date.getDay() no fuso do servidor) — é o que a
    // tela de Cotação usa pra já abrir sugerindo as categorias certas.
    async listToday(user: any, storeId: string) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        const diaSemana = new Date().getDay();

        const entries = await this.prisma.quotationScheduleEntry.findMany({
            where: { storeId, diaSemana },
            include: { category: true },
            orderBy: { category: { name: 'asc' } },
        });

        return {
            diaSemana,
            diaSemanaLabel: DIAS_SEMANA[diaSemana],
            categorias: entries.map((entry) => entry.category),
        };
    }

    // ---------------------------------------------------------------
    // Lista sugerida (preview — nada é persistido em Quotation/
    // QuotationItem ainda, isso só nasce na Fase 3, quando a cotação é
    // efetivamente enviada pro WhatsApp dos fornecedores). A lista em si
    // (quais itens entram) é curada manualmente pelo usuário — ver
    // QuotationCategoryItem — não é mais um casamento automático por
    // nome de categoria.
    // ---------------------------------------------------------------

    private serializeCategoryItem(row: any) {
        const stockItem = row.stockItem;

        if (stockItem) {
            const quantidadeAtual = Number(stockItem.quantidadeAtual);
            const quantidadeMinima =
                stockItem.estoqueMinimo != null
                    ? Number(stockItem.estoqueMinimo)
                    : null;
            const quantidadeMaxima =
                stockItem.estoqueMaximo != null
                    ? Number(stockItem.estoqueMaximo)
                    : null;

            const override =
                row.quantidadeSugeridaOverride != null
                    ? Number(row.quantidadeSugeridaOverride)
                    : null;

            const quantidadeSugerida =
                override != null
                    ? override
                    : quantidadeMaxima != null
                        ? Math.max(0, quantidadeMaxima - quantidadeAtual)
                        : 0;

            return {
                id: row.id,
                stockItemId: stockItem.id,
                descricao: stockItem.nome,
                unidadeMedida: stockItem.unidadeMedida,
                quantidadeAtual,
                quantidadeMinima,
                quantidadeMaxima,
                quantidadeSugerida,
                overrideAplicado: override != null,
                ordem: row.ordem,
            };
        }

        // Item avulso (sem StockItem vinculado) — a quantidade só existe
        // como override, é obrigatória nesse caso.
        return {
            id: row.id,
            stockItemId: null,
            descricao: row.descricaoManual || '(sem descrição)',
            unidadeMedida: row.unidadeMedidaManual || 'UNIDADE',
            quantidadeAtual: null,
            quantidadeMinima: null,
            quantidadeMaxima: null,
            quantidadeSugerida:
                row.quantidadeSugeridaOverride != null
                    ? Number(row.quantidadeSugeridaOverride)
                    : 0,
            overrideAplicado: true,
            ordem: row.ordem,
        };
    }

    async suggestedList(user: any, storeId: string, categoryId: string) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        const category = await this.prisma.supplierCategory.findUnique({
            where: { id: categoryId },
        });

        if (!category) {
            throw new NotFoundException('Categoria não encontrada.');
        }

        const rows = await this.prisma.quotationCategoryItem.findMany({
            where: { categoryId, storeId },
            include: { stockItem: true },
            orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
        });

        return {
            category,
            items: rows.map((row) => this.serializeCategoryItem(row)),
        };
    }

    // --- CRUD da lista curada (adicionar/editar/remover item da lista
    // de uma categoria) ---

    async addCategoryItem(dto: CreateCategoryItemDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const category = await this.prisma.supplierCategory.findUnique({
            where: { id: dto.categoryId },
        });

        if (!category) {
            throw new NotFoundException('Categoria não encontrada.');
        }

        if (!dto.stockItemId && !dto.descricaoManual) {
            throw new BadRequestException(
                'Escolha um item do Estoque ou informe uma descrição pro item avulso.',
            );
        }

        if (dto.stockItemId) {
            const stockItem = await this.prisma.stockItem.findUnique({
                where: { id: dto.stockItemId },
            });

            if (!stockItem || stockItem.storeId !== dto.storeId) {
                throw new NotFoundException(
                    'Item do Estoque não encontrado nessa loja.',
                );
            }
        }

        try {
            const created = await this.prisma.quotationCategoryItem.create({
                data: {
                    categoryId: dto.categoryId,
                    storeId: dto.storeId,
                    stockItemId: dto.stockItemId,
                    descricaoManual: dto.stockItemId
                        ? undefined
                        : dto.descricaoManual,
                    unidadeMedidaManual: dto.stockItemId
                        ? undefined
                        : dto.unidadeMedidaManual,
                    quantidadeSugeridaOverride: dto.quantidadeSugeridaOverride,
                    ordem: dto.ordem ?? 0,
                },
                include: { stockItem: true },
            });

            return this.serializeCategoryItem(created);
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'Esse item já está na lista dessa categoria.',
                );
            }

            throw error;
        }
    }

    async updateCategoryItem(id: string, dto: UpdateCategoryItemDto, user: any) {
        const row = await this.prisma.quotationCategoryItem.findUnique({
            where: { id },
        });

        if (!row) {
            throw new NotFoundException('Item não encontrado.');
        }

        this.ensureStoreAccess(row.storeId, user);

        const updated = await this.prisma.quotationCategoryItem.update({
            where: { id },
            data: {
                descricaoManual: row.stockItemId
                    ? undefined
                    : dto.descricaoManual,
                quantidadeSugeridaOverride: dto.quantidadeSugeridaOverride,
                ordem: dto.ordem,
            },
            include: { stockItem: true },
        });

        return this.serializeCategoryItem(updated);
    }

    async removeCategoryItem(id: string, user: any) {
        const row = await this.prisma.quotationCategoryItem.findUnique({
            where: { id },
        });

        if (!row) {
            throw new NotFoundException('Item não encontrado.');
        }

        this.ensureStoreAccess(row.storeId, user);

        await this.prisma.quotationCategoryItem.delete({ where: { id } });

        return { ok: true };
    }

    // ---------------------------------------------------------------
    // Fase 3 — gerar + enviar cotação pros fornecedores por WhatsApp.
    // ---------------------------------------------------------------

    // Acha quem seria convidado pra cotação dessa categoria/loja, sem
    // enviar nada — usado pelo frontend pra mostrar antes de confirmar o
    // envio. Um fornecedor sem telefone cadastrado aparece separado (não
    // dá pra mandar WhatsApp pra ele, mas ele continua contando pra
    // comparação de preço manual se algum dia isso existir).
    private async resolveCandidateSuppliers(
        storeId: string,
        categoryId: string,
        supplierIds?: string[],
    ) {
        if (supplierIds && supplierIds.length > 0) {
            const suppliers = await this.prisma.supplier.findMany({
                where: { id: { in: supplierIds }, active: true },
            });

            return suppliers;
        }

        const links = await this.prisma.supplierCategoryLink.findMany({
            where: { categoryId },
            include: { supplier: { include: { stores: true } } },
        });

        const seen = new Set<string>();
        const candidates: (typeof links)[number]['supplier'][] = [];

        for (const link of links) {
            const supplier = link.supplier;

            if (!supplier.active) continue;
            if (seen.has(supplier.id)) continue;

            // Lista de lojas vazia = atende todas. Se tiver lista, só
            // entra se a loja ativa estiver nela.
            const atendeLoja =
                supplier.stores.length === 0 ||
                supplier.stores.some((s) => s.storeId === storeId);

            if (!atendeLoja) continue;

            seen.add(supplier.id);
            candidates.push(supplier);
        }

        return candidates;
    }

    async candidateSuppliers(
        user: any,
        storeId: string,
        categoryId: string,
    ) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        const category = await this.prisma.supplierCategory.findUnique({
            where: { id: categoryId },
        });

        if (!category) {
            throw new NotFoundException('Categoria não encontrada.');
        }

        const suppliers = await this.resolveCandidateSuppliers(
            storeId,
            categoryId,
        );

        return {
            comTelefone: suppliers.filter((s) => Boolean(s.phone)),
            semTelefone: suppliers.filter((s) => !s.phone),
        };
    }

    // Gera a Quotation (com snapshot dos itens da lista curada), cria um
    // QuotationSupplier por fornecedor convidado (cada um com seu próprio
    // token de link público) e dispara um evento por fornecedor com
    // telefone pro WhatsappService mandar a mensagem — ver
    // src/common/events.ts (QUOTATION_SUPPLIER_INVITED_EVENT). A página
    // pública que o link abre ainda não existe (Fase 4): o fornecedor vai
    // receber a mensagem, mas o link só funciona de verdade depois disso.
    async sendQuotation(dto: SendQuotationDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const [store, category, categoryItemRows] = await Promise.all([
            this.prisma.store.findUnique({ where: { id: dto.storeId } }),
            this.prisma.supplierCategory.findUnique({
                where: { id: dto.categoryId },
            }),
            this.prisma.quotationCategoryItem.findMany({
                where: { categoryId: dto.categoryId, storeId: dto.storeId },
                include: { stockItem: true },
                orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
            }),
        ]);

        if (!store) {
            throw new NotFoundException('Loja não encontrada.');
        }

        if (!category) {
            throw new NotFoundException('Categoria não encontrada.');
        }

        if (categoryItemRows.length === 0) {
            throw new BadRequestException(
                'Essa categoria ainda não tem nenhum item na lista. Adicione os itens antes de enviar a cotação.',
            );
        }

        const candidateSuppliers = await this.resolveCandidateSuppliers(
            dto.storeId,
            dto.categoryId,
            dto.supplierIds,
        );

        const suppliersWithPhone = candidateSuppliers.filter((s) =>
            Boolean(s.phone),
        );
        const suppliersWithoutPhone = candidateSuppliers.filter(
            (s) => !s.phone,
        );

        if (suppliersWithPhone.length === 0) {
            throw new BadRequestException(
                'Nenhum fornecedor dessa categoria tem telefone cadastrado. Cadastre o telefone do fornecedor em Cadastros → Fornecedores antes de enviar.',
            );
        }

        const itemsData = categoryItemRows.map((row) => {
            const serialized = this.serializeCategoryItem(row);

            return {
                stockItemId: serialized.stockItemId ?? undefined,
                descricao: serialized.descricao,
                unidadeMedida: serialized.unidadeMedida,
                quantidadeAtual:
                    serialized.quantidadeAtual != null
                        ? new Prisma.Decimal(serialized.quantidadeAtual)
                        : undefined,
                quantidadeMinima:
                    serialized.quantidadeMinima != null
                        ? new Prisma.Decimal(serialized.quantidadeMinima)
                        : undefined,
                quantidadeMaxima:
                    serialized.quantidadeMaxima != null
                        ? new Prisma.Decimal(serialized.quantidadeMaxima)
                        : undefined,
                quantidadeSugerida: new Prisma.Decimal(
                    serialized.quantidadeSugerida,
                ),
            };
        });

        const quotation = await this.prisma.$transaction(async (tx) => {
            const created = await tx.quotation.create({
                data: {
                    storeId: dto.storeId,
                    categoryId: dto.categoryId,
                    status: QuotationStatus.SENT,
                    createdById: user.id,
                    sentAt: new Date(),
                    items: { create: itemsData },
                    suppliers: {
                        create: suppliersWithPhone.map((supplier) => ({
                            supplierId: supplier.id,
                            token: randomBytes(24).toString('hex'),
                            sentAt: new Date(),
                        })),
                    },
                },
                include: {
                    suppliers: { include: { supplier: true } },
                },
            });

            return created;
        });

        const frontendUrl = (process.env.FRONTEND_URL || '').replace(
            /\/$/,
            '',
        );

        for (const quotationSupplier of quotation.suppliers) {
            const link = `${frontendUrl}/cotacao-publica/${quotationSupplier.token}`;

            const event: QuotationSupplierInvitedEvent = {
                userId: user.id,
                phone: quotationSupplier.supplier.phone as string,
                quotationSupplierId: quotationSupplier.id,
                supplierName: quotationSupplier.supplier.name,
                categoryName: category.name,
                storeName: store.name,
                link,
                itemsCount: itemsData.length,
            };

            this.eventEmitter.emit(QUOTATION_SUPPLIER_INVITED_EVENT, event);
        }

        return {
            quotationId: quotation.id,
            itemsCount: itemsData.length,
            convidados: quotation.suppliers.map((qs) => ({
                supplierId: qs.supplierId,
                supplierName: qs.supplier.name,
            })),
            semTelefone: suppliersWithoutPhone.map((s) => ({
                id: s.id,
                name: s.name,
            })),
        };
    }

    // ---------------------------------------------------------------
    // Fase 4 — página pública do fornecedor (sem login, identificada só
    // pelo token do link). Nada aqui passa por ensureStoreAccess —
    // o token já é a autenticação.
    // ---------------------------------------------------------------

    async getPublicQuotation(token: string) {
        const quotationSupplier = await this.prisma.quotationSupplier.findUnique({
            where: { token },
            include: {
                supplier: true,
                quotation: {
                    include: { store: true, category: true, items: true },
                },
                prices: true,
            },
        });

        if (!quotationSupplier) {
            throw new NotFoundException('Link inválido ou expirado.');
        }

        const { quotation } = quotationSupplier;

        const pricesByItemId = new Map(
            quotationSupplier.prices.map((price) => [
                price.quotationItemId,
                Number(price.unitPrice),
            ]),
        );

        return {
            supplierName: quotationSupplier.supplier.name,
            storeName: quotation.store.name,
            categoryName: quotation.category.name,
            quotationStatus: quotation.status,
            // Só aceita preenchimento enquanto a cotação está "SENT" —
            // depois que o comprador escolhe o vencedor (ou cancela), a
            // página vira só-leitura.
            aberta: quotation.status === QuotationStatus.SENT,
            declinedAt: quotationSupplier.declinedAt,
            respondedAt: quotationSupplier.respondedAt,
            isWinner:
                quotation.selectedSupplierId === quotationSupplier.supplierId,
            items: quotation.items.map((item) => ({
                id: item.id,
                descricao: item.descricao,
                unidadeMedida: item.unidadeMedida,
                quantidadeSugerida: Number(item.quantidadeSugerida),
                unitPrice: pricesByItemId.get(item.id) ?? null,
            })),
        };
    }

    async submitPublicPrices(token: string, dto: SubmitQuotationPricesDto) {
        const quotationSupplier = await this.prisma.quotationSupplier.findUnique({
            where: { token },
            include: { quotation: { include: { items: true } } },
        });

        if (!quotationSupplier) {
            throw new NotFoundException('Link inválido ou expirado.');
        }

        if (quotationSupplier.quotation.status !== QuotationStatus.SENT) {
            throw new BadRequestException(
                'Essa cotação já foi encerrada e não aceita mais preços.',
            );
        }

        const validItemIds = new Set(
            quotationSupplier.quotation.items.map((item) => item.id),
        );

        for (const entry of dto.prices) {
            if (!validItemIds.has(entry.quotationItemId)) {
                throw new BadRequestException('Item inválido pra essa cotação.');
            }
        }

        await this.prisma.$transaction([
            ...dto.prices.map((entry) =>
                this.prisma.quotationSupplierPrice.upsert({
                    where: {
                        quotationSupplierId_quotationItemId: {
                            quotationSupplierId: quotationSupplier.id,
                            quotationItemId: entry.quotationItemId,
                        },
                    },
                    create: {
                        quotationSupplierId: quotationSupplier.id,
                        quotationItemId: entry.quotationItemId,
                        unitPrice: new Prisma.Decimal(entry.unitPrice),
                    },
                    update: {
                        unitPrice: new Prisma.Decimal(entry.unitPrice),
                    },
                }),
            ),
            this.prisma.quotationSupplier.update({
                where: { id: quotationSupplier.id },
                // Reenviar preço depois de ter recusado conta como "mudou
                // de ideia" — limpa o declinedAt.
                data: { respondedAt: new Date(), declinedAt: null },
            }),
        ]);

        return { ok: true };
    }

    async declinePublicQuotation(token: string) {
        const quotationSupplier = await this.prisma.quotationSupplier.findUnique({
            where: { token },
            include: { quotation: true },
        });

        if (!quotationSupplier) {
            throw new NotFoundException('Link inválido ou expirado.');
        }

        if (quotationSupplier.quotation.status !== QuotationStatus.SENT) {
            throw new BadRequestException('Essa cotação já foi encerrada.');
        }

        await this.prisma.quotationSupplier.update({
            where: { id: quotationSupplier.id },
            data: { declinedAt: new Date() },
        });

        return { ok: true };
    }

    // ---------------------------------------------------------------
    // Fase 5 — tela de comparação + escolha do fornecedor vencedor.
    // ---------------------------------------------------------------

    // Lista as cotações já enviadas dessa loja (mais recente primeiro),
    // com um resumo pra montar os cards na tela — sem o detalhe item a
    // item, isso só carrega quando abre uma específica.
    async listQuotations(user: any, storeId: string, status?: string) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        const quotations = await this.prisma.quotation.findMany({
            where: {
                storeId,
                ...(status ? { status: status as QuotationStatus } : {}),
            },
            include: {
                category: true,
                selectedSupplier: true,
                suppliers: true,
                items: true,
            },
            orderBy: { sentAt: 'desc' },
        });

        return quotations.map((quotation) => ({
            id: quotation.id,
            categoryName: quotation.category.name,
            status: quotation.status,
            sentAt: quotation.sentAt,
            itemsCount: quotation.items.length,
            suppliersInvited: quotation.suppliers.length,
            suppliersResponded: quotation.suppliers.filter((s) => s.respondedAt)
                .length,
            suppliersDeclined: quotation.suppliers.filter((s) => s.declinedAt)
                .length,
            selectedSupplierName: quotation.selectedSupplier?.name ?? null,
        }));
    }

    // Detalhe completo pra tela de comparação — uma linha por item, uma
    // coluna por fornecedor convidado, com o preço que cada um mandou
    // (ou null se ainda não respondeu) e o total calculado só com os
    // itens que esse fornecedor preencheu.
    async getQuotationDetail(user: any, id: string) {
        const quotation = await this.prisma.quotation.findUnique({
            where: { id },
            include: {
                store: true,
                category: true,
                items: { orderBy: { createdAt: 'asc' } },
                suppliers: {
                    include: { supplier: true, prices: true },
                },
            },
        });

        if (!quotation) {
            throw new NotFoundException('Cotação não encontrada.');
        }

        this.ensureStoreAccess(quotation.storeId, user);

        const suppliers = quotation.suppliers.map((qs) => {
            const pricesByItemId = new Map(
                qs.prices.map((price) => [
                    price.quotationItemId,
                    Number(price.unitPrice),
                ]),
            );

            let total = 0;
            let itemsRespondidos = 0;

            for (const item of quotation.items) {
                const unitPrice = pricesByItemId.get(item.id);
                if (unitPrice == null) continue;

                itemsRespondidos += 1;
                total += unitPrice * Number(item.quantidadeSugerida);
            }

            return {
                id: qs.id,
                supplierId: qs.supplierId,
                supplierName: qs.supplier.name,
                respondedAt: qs.respondedAt,
                declinedAt: qs.declinedAt,
                itemsRespondidos,
                total,
                prices: Object.fromEntries(pricesByItemId),
            };
        });

        return {
            id: quotation.id,
            storeName: quotation.store.name,
            categoryName: quotation.category.name,
            status: quotation.status,
            sentAt: quotation.sentAt,
            selectedSupplierId: quotation.selectedSupplierId,
            items: quotation.items.map((item) => ({
                id: item.id,
                descricao: item.descricao,
                unidadeMedida: item.unidadeMedida,
                quantidadeSugerida: Number(item.quantidadeSugerida),
            })),
            suppliers,
        };
    }

    // Compra escolhe o vencedor — dá pra trocar de ideia enquanto o
    // pedido ainda não foi confirmado pelo fornecedor (Fase 6). Só
    // aceita fornecedor que já respondeu com pelo menos um preço, senão
    // não tem base nenhuma pra escolher.
    async selectSupplier(id: string, dto: SelectSupplierDto, user: any) {
        const quotation = await this.prisma.quotation.findUnique({
            where: { id },
            include: { suppliers: true },
        });

        if (!quotation) {
            throw new NotFoundException('Cotação não encontrada.');
        }

        this.ensureStoreAccess(quotation.storeId, user);

        if (
            quotation.status !== QuotationStatus.SENT &&
            quotation.status !== QuotationStatus.SUPPLIER_SELECTED
        ) {
            throw new BadRequestException(
                'Essa cotação já foi fechada e não dá mais pra trocar o fornecedor.',
            );
        }

        const target = quotation.suppliers.find(
            (s) => s.supplierId === dto.supplierId,
        );

        if (!target) {
            throw new NotFoundException(
                'Esse fornecedor não foi convidado pra essa cotação.',
            );
        }

        if (!target.respondedAt) {
            throw new BadRequestException(
                'Esse fornecedor ainda não enviou preços — não dá pra escolher.',
            );
        }

        await this.prisma.quotation.update({
            where: { id },
            data: {
                selectedSupplierId: dto.supplierId,
                selectedAt: new Date(),
                status: QuotationStatus.SUPPLIER_SELECTED,
            },
        });

        return { ok: true };
    }

    // ---------------------------------------------------------------
    // Fase 6 — confirmação do pedido pelo fornecedor vencedor +
    // criação automática da Purchase.
    // ---------------------------------------------------------------

    // Calcula o total de uma cotação pro preço enviado por um fornecedor
    // específico — mesma lógica usada em getQuotationDetail, mas
    // isolada aqui porque é reaproveitada tanto no pedido de confirmação
    // quanto na página pública e na hora de criar a Purchase.
    private calcularTotalFornecedor(
        items: { id: string; quantidadeSugerida: Prisma.Decimal | number }[],
        prices: { quotationItemId: string; unitPrice: Prisma.Decimal | number }[],
    ) {
        const pricesByItemId = new Map(
            prices.map((p) => [p.quotationItemId, Number(p.unitPrice)]),
        );

        let total = 0;

        for (const item of items) {
            const unitPrice = pricesByItemId.get(item.id);
            if (unitPrice == null) continue;

            total += unitPrice * Number(item.quantidadeSugerida);
        }

        return total;
    }

    // Comprador já escolheu o vencedor (Fase 5) e agora pede pra ele
    // confirmar o pedido de verdade — gera (ou reaproveita) o
    // confirmToken e dispara o WhatsApp com o link + valor total.
    async requestOrderConfirmation(id: string, user: any) {
        const quotation = await this.prisma.quotation.findUnique({
            where: { id },
            include: {
                store: true,
                category: true,
                items: true,
                suppliers: { include: { supplier: true, prices: true } },
            },
        });

        if (!quotation) {
            throw new NotFoundException('Cotação não encontrada.');
        }

        this.ensureStoreAccess(quotation.storeId, user);

        if (quotation.status !== QuotationStatus.SUPPLIER_SELECTED) {
            throw new BadRequestException(
                'Escolha um fornecedor vencedor antes de pedir confirmação do pedido.',
            );
        }

        const winner = quotation.suppliers.find(
            (s) => s.supplierId === quotation.selectedSupplierId,
        );

        if (!winner) {
            throw new NotFoundException(
                'Fornecedor vencedor não encontrado nessa cotação.',
            );
        }

        if (!winner.supplier.phone) {
            throw new BadRequestException(
                'O fornecedor vencedor não tem telefone cadastrado. Cadastre o telefone em Cadastros → Fornecedores antes de pedir confirmação.',
            );
        }

        const confirmToken = winner.confirmToken || randomBytes(24).toString('hex');

        await this.prisma.quotationSupplier.update({
            where: { id: winner.id },
            data: { confirmToken, confirmSentAt: new Date() },
        });

        const total = this.calcularTotalFornecedor(
            quotation.items,
            winner.prices,
        );

        const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
        const link = `${frontendUrl}/cotacao-confirmar/${confirmToken}`;

        const event: QuotationOrderConfirmRequestedEvent = {
            userId: user.id,
            phone: winner.supplier.phone,
            quotationSupplierId: winner.id,
            supplierName: winner.supplier.name,
            categoryName: quotation.category.name,
            storeName: quotation.store.name,
            link,
            total,
        };

        this.eventEmitter.emit(QUOTATION_ORDER_CONFIRM_REQUESTED_EVENT, event);

        return { ok: true, total };
    }

    // --- Página pública de confirmação (sem login, token próprio) ---

    async getPublicOrderConfirmation(confirmToken: string) {
        const quotationSupplier = await this.prisma.quotationSupplier.findUnique(
            {
                where: { confirmToken },
                include: {
                    supplier: true,
                    prices: true,
                    quotation: {
                        include: { store: true, category: true, items: true },
                    },
                },
            },
        );

        if (!quotationSupplier) {
            throw new NotFoundException('Link inválido ou expirado.');
        }

        const { quotation } = quotationSupplier;

        const pricesByItemId = new Map(
            quotationSupplier.prices.map((p) => [
                p.quotationItemId,
                Number(p.unitPrice),
            ]),
        );

        const isWinner =
            quotation.selectedSupplierId === quotationSupplier.supplierId;

        return {
            supplierName: quotationSupplier.supplier.name,
            storeName: quotation.store.name,
            categoryName: quotation.category.name,
            quotationStatus: quotation.status,
            isWinner,
            jaConfirmado: Boolean(quotationSupplier.confirmedAt),
            podeConfirmar:
                isWinner &&
                quotation.status === QuotationStatus.SUPPLIER_SELECTED &&
                !quotationSupplier.confirmedAt,
            total: this.calcularTotalFornecedor(
                quotation.items,
                quotationSupplier.prices,
            ),
            items: quotation.items.map((item) => ({
                id: item.id,
                descricao: item.descricao,
                unidadeMedida: item.unidadeMedida,
                quantidadeSugerida: Number(item.quantidadeSugerida),
                unitPrice: pricesByItemId.get(item.id) ?? null,
            })),
        };
    }

    // Fornecedor clica em "Confirmar pedido" — cria a Purchase (Fluxo 2:
    // sem NF ainda, item a item, pronta pra aparecer no recebimento) e
    // fecha a cotação. Idempotente: clicar duas vezes não duplica nada.
    async confirmPublicOrder(confirmToken: string) {
        const quotationSupplier = await this.prisma.quotationSupplier.findUnique(
            {
                where: { confirmToken },
                include: {
                    supplier: true,
                    prices: true,
                    quotation: {
                        include: { items: true, store: true, category: true },
                    },
                },
            },
        );

        if (!quotationSupplier) {
            throw new NotFoundException('Link inválido ou expirado.');
        }

        const { quotation } = quotationSupplier;

        if (quotation.selectedSupplierId !== quotationSupplier.supplierId) {
            throw new BadRequestException(
                'Esse fornecedor não é o vencedor dessa cotação.',
            );
        }

        if (quotationSupplier.confirmedAt) {
            return {
                ok: true,
                alreadyConfirmed: true,
                purchaseId: quotation.purchaseId,
            };
        }

        if (quotation.status !== QuotationStatus.SUPPLIER_SELECTED) {
            throw new BadRequestException(
                'Esse pedido não está mais aguardando confirmação.',
            );
        }

        const pricesByItemId = new Map(
            quotationSupplier.prices.map((p) => [
                p.quotationItemId,
                Number(p.unitPrice),
            ]),
        );

        let total = 0;

        const purchaseItemsData = quotation.items.map((item) => {
            const unitPrice = pricesByItemId.get(item.id);
            const quantidade = Number(item.quantidadeSugerida);
            const itemTotal = unitPrice != null ? unitPrice * quantidade : null;

            if (itemTotal != null) total += itemTotal;

            return {
                name: item.descricao,
                quantity: item.quantidadeSugerida,
                unit: item.unidadeMedida === 'KG' ? 'kg' : 'un',
                unitPrice:
                    unitPrice != null ? new Prisma.Decimal(unitPrice) : undefined,
                total:
                    itemTotal != null ? new Prisma.Decimal(itemTotal) : undefined,
            };
        });

        const description = `Cotação ${quotation.category.name} — ${quotationSupplier.supplier.name}`;

        const purchase = await this.prisma.$transaction(async (tx) => {
            const created = await tx.purchase.create({
                data: {
                    description,
                    value: new Prisma.Decimal(total),
                    method: PaymentMethod.COMPANY_ACCOUNT,
                    category: PurchaseCategory.SUPPLIER_ORDER,
                    origin: PurchaseOrigin.WHATSAPP,
                    status: PurchaseStatus.WAITING_RECEIPT,
                    storeId: quotation.storeId,
                    supplierId: quotationSupplier.supplierId,
                    createdById: quotation.createdById,
                    items: { create: purchaseItemsData },
                },
            });

            await tx.quotationSupplier.update({
                where: { id: quotationSupplier.id },
                data: { confirmedAt: new Date() },
            });

            await tx.quotation.update({
                where: { id: quotation.id },
                data: {
                    status: QuotationStatus.ORDER_CONFIRMED,
                    orderConfirmedAt: new Date(),
                    purchaseId: created.id,
                },
            });

            return created;
        });

        await this.notificationsService.notifyStoreAccess({
            storeId: quotation.storeId,
            allowedRoles: PURCHASE_NOTIFY_ROLES,
            title: 'Fornecedor confirmou pedido de cotação',
            message: `${quotationSupplier.supplier.name} confirmou o pedido de "${quotation.category.name}" — compra criada aguardando recebimento.`,
            type: NotificationType.PURCHASE_CREATED,
        });

        return { ok: true, purchaseId: purchase.id };
    }
}
