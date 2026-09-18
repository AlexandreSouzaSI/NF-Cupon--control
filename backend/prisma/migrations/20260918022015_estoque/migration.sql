-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StockMovementOrigin" AS ENUM ('NF_COMPRA', 'MANUAL', 'IMPORTACAO_PLANILHA', 'CONSUMO_VENDA');

-- AlterEnum
ALTER TYPE "StoreModule" ADD VALUE 'ESTOQUE';

-- AlterTable
ALTER TABLE "IncomingGoodsNf" ADD COLUMN     "stockLinkedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "enabledModules" SET DEFAULT ARRAY['COMPRAS', 'NOTAS_FISCAIS', 'SERVICOS', 'TRIBUTOS', 'PERDAS', 'CONTAS_A_PAGAR', 'TAREFAS', 'RELATORIOS', 'FUNCIONARIOS', 'FREELANCERS', 'PRODUTOS', 'ESTOQUE']::"StoreModule"[];

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeChave" TEXT NOT NULL,
    "categoria" TEXT,
    "unidadeMedida" "IngredientUnidade" NOT NULL DEFAULT 'KG',
    "quantidadeAtual" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "valorMedioUnitario" DECIMAL(12,4),
    "ingredientId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "tipo" "StockMovementType" NOT NULL,
    "origem" "StockMovementOrigin" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "valorTotal" DECIMAL(12,2),
    "sourceRef" TEXT,
    "observacao" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_ingredientId_key" ON "StockItem"("ingredientId");

-- CreateIndex
CREATE INDEX "StockItem_storeId_idx" ON "StockItem"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_storeId_nomeChave_key" ON "StockItem"("storeId", "nomeChave");

-- CreateIndex
CREATE INDEX "StockMovement_storeId_idx" ON "StockMovement"("storeId");

-- CreateIndex
CREATE INDEX "StockMovement_stockItemId_idx" ON "StockMovement"("stockItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_storeId_sourceRef_key" ON "StockMovement"("storeId", "sourceRef");

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
