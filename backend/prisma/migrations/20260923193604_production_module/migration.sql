/*
  Warnings:

  - A unique constraint covering the columns `[storeId,produtoChave,productionItemId]` on the table `ProductRecipeItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ProductionUnidade" AS ENUM ('KG', 'ML', 'UNIDADE');

-- CreateEnum
CREATE TYPE "ProductionMovementType" AS ENUM ('PRODUCAO', 'CONSUMO_VENDA', 'AJUSTE');

-- AlterTable
ALTER TABLE "ProductRecipeItem" ADD COLUMN     "productionItemId" TEXT,
ALTER COLUMN "ingredientId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProductionItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeChave" TEXT NOT NULL,
    "unidadeMedida" "ProductionUnidade" NOT NULL DEFAULT 'KG',
    "baseQuantidade" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "quantidadeAtual" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRecipeItem" (
    "id" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionMovement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productionItemId" TEXT NOT NULL,
    "tipo" "ProductionMovementType" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "sourceRef" TEXT,
    "observacao" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionItem_storeId_idx" ON "ProductionItem"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionItem_storeId_nomeChave_key" ON "ProductionItem"("storeId", "nomeChave");

-- CreateIndex
CREATE INDEX "ProductionRecipeItem_stockItemId_idx" ON "ProductionRecipeItem"("stockItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRecipeItem_productionItemId_stockItemId_key" ON "ProductionRecipeItem"("productionItemId", "stockItemId");

-- CreateIndex
CREATE INDEX "ProductionMovement_storeId_idx" ON "ProductionMovement"("storeId");

-- CreateIndex
CREATE INDEX "ProductionMovement_productionItemId_idx" ON "ProductionMovement"("productionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionMovement_storeId_sourceRef_key" ON "ProductionMovement"("storeId", "sourceRef");

-- CreateIndex
CREATE INDEX "ProductRecipeItem_productionItemId_idx" ON "ProductRecipeItem"("productionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipeItem_storeId_produtoChave_productionItemId_key" ON "ProductRecipeItem"("storeId", "produtoChave", "productionItemId");

-- AddForeignKey
ALTER TABLE "ProductRecipeItem" ADD CONSTRAINT "ProductRecipeItem_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecipeItem" ADD CONSTRAINT "ProductionRecipeItem_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecipeItem" ADD CONSTRAINT "ProductionRecipeItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMovement" ADD CONSTRAINT "ProductionMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMovement" ADD CONSTRAINT "ProductionMovement_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMovement" ADD CONSTRAINT "ProductionMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
