-- AlterTable
ALTER TABLE "ProductSalesImport" ADD COLUMN     "periodoFim" TIMESTAMP(3),
ADD COLUMN     "periodoInicio" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductWeightConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "produtoChave" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "gramaturaGramas" DECIMAL(10,2),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductWeightConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductWeightConfig_storeId_idx" ON "ProductWeightConfig"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductWeightConfig_storeId_produtoChave_key" ON "ProductWeightConfig"("storeId", "produtoChave");

-- AddForeignKey
ALTER TABLE "ProductWeightConfig" ADD CONSTRAINT "ProductWeightConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductWeightConfig" ADD CONSTRAINT "ProductWeightConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
