-- CreateTable
CREATE TABLE "ProductCatalogItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoChave" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCatalogItem_storeId_idx" ON "ProductCatalogItem"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCatalogItem_storeId_produtoChave_key" ON "ProductCatalogItem"("storeId", "produtoChave");

-- AddForeignKey
ALTER TABLE "ProductCatalogItem" ADD CONSTRAINT "ProductCatalogItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
