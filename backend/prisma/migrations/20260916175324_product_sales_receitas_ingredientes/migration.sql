/*
  Warnings:

  - You are about to drop the `ProductWeightConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProductWeightConfig" DROP CONSTRAINT "ProductWeightConfig_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductWeightConfig" DROP CONSTRAINT "ProductWeightConfig_updatedById_fkey";

-- DropTable
DROP TABLE "ProductWeightConfig";

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeChave" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecipeItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoChave" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "gramas" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ingredient_storeId_idx" ON "Ingredient"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_storeId_nomeChave_key" ON "Ingredient"("storeId", "nomeChave");

-- CreateIndex
CREATE INDEX "ProductRecipeItem_storeId_produtoChave_idx" ON "ProductRecipeItem"("storeId", "produtoChave");

-- CreateIndex
CREATE INDEX "ProductRecipeItem_ingredientId_idx" ON "ProductRecipeItem"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipeItem_storeId_produtoChave_ingredientId_key" ON "ProductRecipeItem"("storeId", "produtoChave", "ingredientId");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeItem" ADD CONSTRAINT "ProductRecipeItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeItem" ADD CONSTRAINT "ProductRecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
