/*
  Warnings:

  - You are about to drop the column `ingredientId` on the `ProductRecipeItem` table. All the data in the column will be lost.
  - You are about to drop the column `ingredientId` on the `StockItem` table. All the data in the column will be lost.
  - You are about to drop the `Ingredient` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[storeId,produtoChave,stockItemId]` on the table `ProductRecipeItem` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Ingredient" DROP CONSTRAINT "Ingredient_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductRecipeItem" DROP CONSTRAINT "ProductRecipeItem_ingredientId_fkey";

-- DropForeignKey
ALTER TABLE "StockItem" DROP CONSTRAINT "StockItem_ingredientId_fkey";

-- DropIndex
DROP INDEX "ProductRecipeItem_ingredientId_idx";

-- DropIndex
DROP INDEX "ProductRecipeItem_storeId_produtoChave_ingredientId_key";

-- DropIndex
DROP INDEX "StockItem_ingredientId_key";

-- AlterTable
ALTER TABLE "ProductRecipeItem" DROP COLUMN "ingredientId",
ADD COLUMN     "stockItemId" TEXT;

-- AlterTable
ALTER TABLE "StockItem" DROP COLUMN "ingredientId",
ADD COLUMN     "categoriaLista" TEXT,
ADD COLUMN     "isProteina" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ordemLista" INTEGER,
ADD COLUMN     "pesoUnidadeGramas" DECIMAL(10,2),
ADD COLUMN     "porcaoPadraoGramas" DECIMAL(10,2);

-- DropTable
DROP TABLE "Ingredient";

-- CreateIndex
CREATE INDEX "ProductRecipeItem_stockItemId_idx" ON "ProductRecipeItem"("stockItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipeItem_storeId_produtoChave_stockItemId_key" ON "ProductRecipeItem"("storeId", "produtoChave", "stockItemId");

-- AddForeignKey
ALTER TABLE "ProductRecipeItem" ADD CONSTRAINT "ProductRecipeItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
