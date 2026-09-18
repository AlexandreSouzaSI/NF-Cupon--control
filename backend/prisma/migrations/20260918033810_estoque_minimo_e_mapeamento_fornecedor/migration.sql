-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "estoqueMinimo" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "StockSupplierItemMapping" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "issuerCnpj" TEXT NOT NULL,
    "descricaoChave" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockSupplierItemMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockSupplierItemMapping_storeId_idx" ON "StockSupplierItemMapping"("storeId");

-- CreateIndex
CREATE INDEX "StockSupplierItemMapping_stockItemId_idx" ON "StockSupplierItemMapping"("stockItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockSupplierItemMapping_storeId_issuerCnpj_descricaoChave_key" ON "StockSupplierItemMapping"("storeId", "issuerCnpj", "descricaoChave");

-- AddForeignKey
ALTER TABLE "StockSupplierItemMapping" ADD CONSTRAINT "StockSupplierItemMapping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSupplierItemMapping" ADD CONSTRAINT "StockSupplierItemMapping_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
