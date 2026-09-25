/*
  Warnings:

  - A unique constraint covering the columns `[purchaseId]` on the table `QuotationSupplier` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "QuotationSupplier" ADD COLUMN     "purchaseId" TEXT;

-- AlterTable
ALTER TABLE "QuotationSupplierPrice" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "editedUnitPrice" DECIMAL(12,4),
ADD COLUMN     "selected" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "QuotationSupplier_purchaseId_key" ON "QuotationSupplier"("purchaseId");

-- AddForeignKey
ALTER TABLE "QuotationSupplier" ADD CONSTRAINT "QuotationSupplier_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
