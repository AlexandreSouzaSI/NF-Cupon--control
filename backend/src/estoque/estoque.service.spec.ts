import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StockMovementOrigin, StockMovementType, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { EstoqueService } from './estoque.service';

// Estoque calcula saldo/custo médio ponderado a partir de todo lançamento
// do sistema (compra vinculada, planilha, baixa automática de venda,
// manual) — errar o sinal (entrada/saída) ou o cálculo de custo médio
// distorce o valor de estoque reportado pro dono. Testa a lógica pura
// (serializeItem, applyMovement) e o controle de acesso por loja, sem
// banco real.
function createPrismaMock() {
    return {
        stockItem: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn(),
        },
        stockMovement: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
    };
}

function createTxMock() {
    return {
        stockItem: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        stockMovement: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    };
}

function proprietario(): any {
    return { id: 'user-1', role: UserRole.PROPRIETARIO };
}

function gerenteDaLojaA(): any {
    return {
        id: 'user-2',
        role: UserRole.GERENTE,
        userStores: [{ storeId: 'store-A' }],
    };
}

describe('EstoqueService', () => {
    let service: EstoqueService;
    let prisma: ReturnType<typeof createPrismaMock>;

    beforeEach(async () => {
        prisma = createPrismaMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EstoqueService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<EstoqueService>(EstoqueService);
    });

    describe('serializeItem (via listItems) — cálculo de sugestão e status', () => {
        it('marca abaixoDoMinimo e sugere repor até o Máximo quando cadastrado', async () => {
            prisma.stockItem.findMany.mockResolvedValue([
                {
                    id: 'item-1',
                    nome: 'Refrigerante',
                    descricao: null,
                    categoria: 'Revenda',
                    unidadeMedida: 'UNIDADE',
                    quantidadeAtual: 5,
                    valorMedioUnitario: 3,
                    estoqueMinimo: 10,
                    estoqueMaximo: 50,
                    active: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]);

            const [item] = await service.listItems(proprietario(), { storeId: 'store-A' });

            expect(item.abaixoDoMinimo).toBe(true);
            expect(item.quantidadeSugerida).toBe(45); // repõe até o máximo (50 - 5)
            expect(item.valorEstoque).toBe(15); // 5 * 3
        });

        it('sem Máximo cadastrado, sugestão repõe só até o Mínimo', async () => {
            prisma.stockItem.findMany.mockResolvedValue([
                {
                    id: 'item-2',
                    nome: 'Arroz',
                    descricao: null,
                    categoria: 'Matéria Prima',
                    unidadeMedida: 'KG',
                    quantidadeAtual: 2,
                    valorMedioUnitario: null,
                    estoqueMinimo: 10,
                    estoqueMaximo: null,
                    active: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]);

            const [item] = await service.listItems(proprietario(), { storeId: 'store-A' });

            expect(item.quantidadeSugerida).toBe(8); // 10 - 2
            expect(item.valorEstoque).toBeNull(); // sem custo médio, não estima valor
        });

        it('quantidade negativa marca negativo=true', async () => {
            prisma.stockItem.findMany.mockResolvedValue([
                {
                    id: 'item-3',
                    nome: 'Item furado',
                    descricao: null,
                    categoria: null,
                    unidadeMedida: 'KG',
                    quantidadeAtual: -3,
                    valorMedioUnitario: 2,
                    estoqueMinimo: null,
                    estoqueMaximo: null,
                    active: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]);

            const [item] = await service.listItems(proprietario(), { storeId: 'store-A' });

            expect(item.negativo).toBe(true);
            // valorEstoque só é calculado quando quantidadeAtual > 0
            expect(item.valorEstoque).toBeNull();
        });

        it('exige loja selecionada', async () => {
            await expect(
                service.listItems(proprietario(), { storeId: '' as any }),
            ).rejects.toThrow(BadRequestException);
        });

        it('bloqueia Gerente de listar itens de loja que não é dele', async () => {
            await expect(
                service.listItems(gerenteDaLojaA(), { storeId: 'store-B' }),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('applyMovement (núcleo do ledger) — sinal, dedupe por sourceRef e custo médio', () => {
        it('ENTRADA soma no saldo (sinal positivo)', async () => {
            const tx = createTxMock();
            tx.stockItem.findUnique.mockResolvedValue({
                id: 'item-1',
                quantidadeAtual: 10,
                valorMedioUnitario: null,
            });

            await (service as any).applyMovement(tx, {
                storeId: 'store-A',
                stockItemId: 'item-1',
                tipo: StockMovementType.ENTRADA,
                origem: StockMovementOrigin.MANUAL,
                quantidade: 5,
            });

            expect(tx.stockItem.update).toHaveBeenCalledWith({
                where: { id: 'item-1' },
                data: { quantidadeAtual: { increment: 5 } },
            });
        });

        it('SAIDA subtrai do saldo (sinal negativo)', async () => {
            const tx = createTxMock();

            await (service as any).applyMovement(tx, {
                storeId: 'store-A',
                stockItemId: 'item-1',
                tipo: StockMovementType.SAIDA,
                origem: StockMovementOrigin.MANUAL,
                quantidade: 5,
            });

            expect(tx.stockItem.update).toHaveBeenCalledWith({
                where: { id: 'item-1' },
                data: { quantidadeAtual: { increment: -5 } },
            });
        });

        it('reprocessar o mesmo sourceRef não duplica — só ajusta o delta', async () => {
            const tx = createTxMock();
            tx.stockMovement.findUnique.mockResolvedValue({
                id: 'mov-1',
                quantidade: 10,
                observacao: 'Venda importada',
            });

            await (service as any).applyMovement(tx, {
                storeId: 'store-A',
                stockItemId: 'item-1',
                tipo: StockMovementType.SAIDA,
                origem: StockMovementOrigin.CONSUMO_VENDA,
                quantidade: 15, // era 10, reimportação corrigiu pra 15
                sourceRef: 'venda-import-42',
            });

            expect(tx.stockMovement.create).not.toHaveBeenCalled();
            expect(tx.stockMovement.update).toHaveBeenCalledWith({
                where: { id: 'mov-1' },
                data: expect.objectContaining({ quantidade: 15 }),
            });
            // delta = 15 - 10 = 5, SAIDA é sinal negativo => increment -5
            expect(tx.stockItem.update).toHaveBeenCalledWith({
                where: { id: 'item-1' },
                data: { quantidadeAtual: { increment: -5 } },
            });
        });

        it('mesmo sourceRef com quantidade igual não mexe no saldo (delta zero)', async () => {
            const tx = createTxMock();
            tx.stockMovement.findUnique.mockResolvedValue({
                id: 'mov-1',
                quantidade: 10,
                observacao: null,
            });

            await (service as any).applyMovement(tx, {
                storeId: 'store-A',
                stockItemId: 'item-1',
                tipo: StockMovementType.SAIDA,
                origem: StockMovementOrigin.CONSUMO_VENDA,
                quantidade: 10,
                sourceRef: 'venda-import-42',
            });

            expect(tx.stockItem.update).not.toHaveBeenCalled();
        });

        it('calcula custo médio ponderado numa ENTRADA nova com valor informado', async () => {
            const tx = createTxMock();
            // depois do increment, saldo atual (retornado pela 2ª leitura) já
            // reflete a entrada de 10 unidades a R$ 5 cada
            tx.stockItem.findUnique.mockResolvedValue({
                id: 'item-1',
                quantidadeAtual: 20, // 10 que já tinha + 10 da entrada
                valorMedioUnitario: 4, // custo médio antes da entrada
            });

            await (service as any).applyMovement(tx, {
                storeId: 'store-A',
                stockItemId: 'item-1',
                tipo: StockMovementType.ENTRADA,
                origem: StockMovementOrigin.MANUAL,
                quantidade: 10,
                valorTotal: 50, // 10 unidades a R$5
            });

            // saldoAntes = 20 - 10 = 10; totalAntes = 10 * 4 = 40
            // novoSaldoBase = 10 + 10 = 20; novoCusto = (40 + 50) / 20 = 4.5
            const updateCalls = tx.stockItem.update.mock.calls;
            const custoCall = updateCalls.find((call: any) => 'valorMedioUnitario' in call[0].data);
            expect(custoCall[0].data.valorMedioUnitario).toBe(4.5);
        });

        it('SAIDA não recalcula custo médio (mesmo com valorTotal informado)', async () => {
            const tx = createTxMock();

            await (service as any).applyMovement(tx, {
                storeId: 'store-A',
                stockItemId: 'item-1',
                tipo: StockMovementType.SAIDA,
                origem: StockMovementOrigin.MANUAL,
                quantidade: 5,
                valorTotal: 100,
            });

            // só 1 update: o de quantidadeAtual — nenhum de custo médio
            expect(tx.stockItem.update).toHaveBeenCalledTimes(1);
        });
    });

    describe('registrarMovimentoManual — validação e controle de loja', () => {
        it('bloqueia lançar movimento em item de outra loja', async () => {
            prisma.stockItem.findUnique.mockResolvedValue({
                id: 'item-1',
                storeId: 'store-B',
            });

            await expect(
                service.registrarMovimentoManual(
                    {
                        storeId: 'store-A',
                        stockItemId: 'item-1',
                        tipo: 'ENTRADA',
                        quantidade: 5,
                    } as any,
                    proprietario(),
                ),
            ).rejects.toThrow(BadRequestException);
        });

        it('lança NotFoundException se o item não existir', async () => {
            prisma.stockItem.findUnique.mockResolvedValue(null);

            await expect(
                service.registrarMovimentoManual(
                    { storeId: 'store-A', stockItemId: 'inexistente', tipo: 'ENTRADA', quantidade: 5 } as any,
                    proprietario(),
                ),
            ).rejects.toThrow(NotFoundException);
        });

        it('bloqueia Gerente de lançar movimento em loja que não é dele', async () => {
            prisma.stockItem.findUnique.mockResolvedValue({
                id: 'item-1',
                storeId: 'store-B',
            });

            await expect(
                service.registrarMovimentoManual(
                    { storeId: 'store-B', stockItemId: 'item-1', tipo: 'ENTRADA', quantidade: 5 } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('createItem — duplicidade e controle de loja', () => {
        it('bloqueia criar item com nome já cadastrado na mesma loja (nomeChave)', async () => {
            prisma.stockItem.findUnique.mockResolvedValue({ id: 'existing' });

            await expect(
                service.createItem(
                    { storeId: 'store-A', nome: 'Arroz' } as any,
                    proprietario(),
                ),
            ).rejects.toThrow(BadRequestException);

            expect(prisma.stockItem.create).not.toHaveBeenCalled();
        });

        it('bloqueia Gerente de criar item em loja que não é dele', async () => {
            await expect(
                service.createItem(
                    { storeId: 'store-B', nome: 'Arroz' } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('bulkUpdateUnidade — validação e acesso multi-loja', () => {
        it('bloqueia lista vazia de ids', async () => {
            await expect(
                service.bulkUpdateUnidade([], 'KG', proprietario()),
            ).rejects.toThrow(BadRequestException);
        });

        it('bloqueia unidade de medida inválida', async () => {
            await expect(
                service.bulkUpdateUnidade(['item-1'], 'TONELADA', proprietario()),
            ).rejects.toThrow(BadRequestException);
        });

        it('bloqueia quando algum item selecionado é de loja fora do acesso do Gerente', async () => {
            prisma.stockItem.findMany.mockResolvedValue([
                { id: 'item-1', storeId: 'store-A' },
                { id: 'item-2', storeId: 'store-B' },
            ]);

            await expect(
                service.bulkUpdateUnidade(['item-1', 'item-2'], 'LITRO', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.stockItem.updateMany).not.toHaveBeenCalled();
        });
    });

    describe('removeItem — exclusão definitiva por loja', () => {
        it('bloqueia Gerente de excluir item de loja que não é dele', async () => {
            prisma.stockItem.findUnique.mockResolvedValue({ id: 'item-1', storeId: 'store-B' });

            await expect(
                service.removeItem('item-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.stockItem.delete).not.toHaveBeenCalled();
        });

        it('lança NotFoundException se o item não existir', async () => {
            prisma.stockItem.findUnique.mockResolvedValue(null);

            await expect(
                service.removeItem('inexistente', proprietario()),
            ).rejects.toThrow(NotFoundException);
        });
    });
});
