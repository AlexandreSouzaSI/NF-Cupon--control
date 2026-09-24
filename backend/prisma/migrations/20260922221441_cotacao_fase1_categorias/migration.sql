-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'SUPPLIER_SELECTED', 'ORDER_CONFIRMED', 'CANCELED');

-- AlterEnum
ALTER TYPE "StoreModule" ADD VALUE 'COTACAO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WhatsappMessageKind" ADD VALUE 'QUOTATION_REQUEST';
ALTER TYPE "WhatsappMessageKind" ADD VALUE 'QUOTATION_ORDER_CONFIRMATION';

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "estoqueMaximo" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "enabledModules" SET DEFAULT ARRAY['COMPRAS', 'NOTAS_FISCAIS', 'SERVICOS', 'TRIBUTOS', 'PERDAS', 'CONTAS_A_PAGAR', 'TAREFAS', 'RELATORIOS', 'FUNCIONARIOS', 'FREELANCERS', 'PRODUTOS', 'ESTOQUE', 'COTACAO']::"StoreModule"[];

-- CreateTable
CREATE TABLE "SupplierCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCategoryLink" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "SupplierCategoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationScheduleEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "selectedSupplierId" TEXT,
    "selectedAt" TIMESTAMP(3),
    "orderConfirmedAt" TIMESTAMP(3),
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "stockItemId" TEXT,
    "descricao" TEXT NOT NULL,
    "unidadeMedida" "IngredientUnidade" NOT NULL DEFAULT 'KG',
    "quantidadeAtual" DECIMAL(12,3),
    "quantidadeMinima" DECIMAL(12,3),
    "quantidadeMaxima" DECIMAL(12,3),
    "quantidadeSugerida" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationSupplier" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "confirmToken" TEXT,
    "confirmSentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationSupplierPrice" (
    "id" TEXT NOT NULL,
    "quotationSupplierId" TEXT NOT NULL,
    "quotationItemId" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationSupplierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategory_nameNormalized_key" ON "SupplierCategory"("nameNormalized");

-- CreateIndex
CREATE INDEX "SupplierCategoryLink_categoryId_idx" ON "SupplierCategoryLink"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategoryLink_supplierId_categoryId_key" ON "SupplierCategoryLink"("supplierId", "categoryId");

-- CreateIndex
CREATE INDEX "QuotationScheduleEntry_storeId_idx" ON "QuotationScheduleEntry"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationScheduleEntry_storeId_diaSemana_categoryId_key" ON "QuotationScheduleEntry"("storeId", "diaSemana", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_purchaseId_key" ON "Quotation"("purchaseId");

-- CreateIndex
CREATE INDEX "Quotation_storeId_idx" ON "Quotation"("storeId");

-- CreateIndex
CREATE INDEX "Quotation_categoryId_idx" ON "Quotation"("categoryId");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationSupplier_token_key" ON "QuotationSupplier"("token");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationSupplier_confirmToken_key" ON "QuotationSupplier"("confirmToken");

-- CreateIndex
CREATE INDEX "QuotationSupplier_quotationId_idx" ON "QuotationSupplier"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationSupplier_supplierId_idx" ON "QuotationSupplier"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationSupplier_quotationId_supplierId_key" ON "QuotationSupplier"("quotationId", "supplierId");

-- CreateIndex
CREATE INDEX "QuotationSupplierPrice_quotationItemId_idx" ON "QuotationSupplierPrice"("quotationItemId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationSupplierPrice_quotationSupplierId_quotationItemId_key" ON "QuotationSupplierPrice"("quotationSupplierId", "quotationItemId");

-- AddForeignKey
ALTER TABLE "SupplierCategoryLink" ADD CONSTRAINT "SupplierCategoryLink_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCategoryLink" ADD CONSTRAINT "SupplierCategoryLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SupplierCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationScheduleEntry" ADD CONSTRAINT "QuotationScheduleEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationScheduleEntry" ADD CONSTRAINT "QuotationScheduleEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SupplierCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SupplierCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_selectedSupplierId_fkey" FOREIGN KEY ("selectedSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationSupplier" ADD CONSTRAINT "QuotationSupplier_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationSupplier" ADD CONSTRAINT "QuotationSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationSupplierPrice" ADD CONSTRAINT "QuotationSupplierPrice_quotationSupplierId_fkey" FOREIGN KEY ("quotationSupplierId") REFERENCES "QuotationSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationSupplierPrice" ADD CONSTRAINT "QuotationSupplierPrice_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
