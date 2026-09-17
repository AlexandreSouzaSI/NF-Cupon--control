-- AlterEnum
ALTER TYPE "StoreModule" ADD VALUE 'PRODUTOS';

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "enabledModules" SET DEFAULT ARRAY['COMPRAS', 'NOTAS_FISCAIS', 'SERVICOS', 'TRIBUTOS', 'PERDAS', 'CONTAS_A_PAGAR', 'TAREFAS', 'RELATORIOS', 'FUNCIONARIOS', 'FREELANCERS', 'PRODUTOS']::"StoreModule"[];

-- CreateTable
CREATE TABLE "ProductSalesImport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nomeLocal" TEXT,
    "exportadoPor" TEXT,
    "exportadoEm" TIMESTAMP(3),
    "arquivoOriginal" TEXT NOT NULL,
    "totalLinhas" INTEGER NOT NULL,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSalesImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSalesEntry" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "produtoChave" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSalesEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSalesImport_storeId_idx" ON "ProductSalesImport"("storeId");

-- CreateIndex
CREATE INDEX "ProductSalesEntry_importId_idx" ON "ProductSalesEntry"("importId");

-- CreateIndex
CREATE INDEX "ProductSalesEntry_produtoChave_idx" ON "ProductSalesEntry"("produtoChave");

-- AddForeignKey
ALTER TABLE "ProductSalesImport" ADD CONSTRAINT "ProductSalesImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSalesImport" ADD CONSTRAINT "ProductSalesImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSalesEntry" ADD CONSTRAINT "ProductSalesEntry_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ProductSalesImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
