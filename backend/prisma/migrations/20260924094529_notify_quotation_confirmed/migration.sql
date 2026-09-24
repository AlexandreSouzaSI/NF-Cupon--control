-- AlterEnum
ALTER TYPE "WhatsappMessageKind" ADD VALUE 'QUOTATION_ORDER_CONFIRMED_INTERNAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyQuotationConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Bill_storeId_status_idx" ON "Bill"("storeId", "status");

-- CreateIndex
CREATE INDEX "Bill_createdAt_idx" ON "Bill"("createdAt");

-- CreateIndex
CREATE INDEX "Purchase_storeId_status_idx" ON "Purchase"("storeId", "status");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");
