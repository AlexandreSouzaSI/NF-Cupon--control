-- CreateTable
CREATE TABLE "QuotationCategoryItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "stockItemId" TEXT,
    "descricaoManual" TEXT,
    "unidadeMedidaManual" "IngredientUnidade",
    "quantidadeSugeridaOverride" DECIMAL(12,3),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationCategoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationCategoryItem_categoryId_idx" ON "QuotationCategoryItem"("categoryId");

-- CreateIndex
CREATE INDEX "QuotationCategoryItem_storeId_idx" ON "QuotationCategoryItem"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationCategoryItem_categoryId_stockItemId_key" ON "QuotationCategoryItem"("categoryId", "stockItemId");

-- AddForeignKey
ALTER TABLE "QuotationCategoryItem" ADD CONSTRAINT "QuotationCategoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SupplierCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationCategoryItem" ADD CONSTRAINT "QuotationCategoryItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationCategoryItem" ADD CONSTRAINT "QuotationCategoryItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
