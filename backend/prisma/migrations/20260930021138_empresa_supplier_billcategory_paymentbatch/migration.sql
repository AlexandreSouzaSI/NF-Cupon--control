/*
  Warnings:

  - A unique constraint covering the columns `[nameNormalized,empresaId]` on the table `BillCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[empresaId]` on the table `PaymentBatchConfig` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nameNormalized,empresaId]` on the table `Supplier` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nameNormalized,empresaId]` on the table `SupplierCategory` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "BillCategory_nameNormalized_key";

-- DropIndex
DROP INDEX "Supplier_nameNormalized_key";

-- DropIndex
DROP INDEX "SupplierCategory_nameNormalized_key";

-- AlterTable
ALTER TABLE "BillCategory" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "PaymentBatchConfig" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "SupplierCategory" ADD COLUMN     "empresaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BillCategory_nameNormalized_empresaId_key" ON "BillCategory"("nameNormalized", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatchConfig_empresaId_key" ON "PaymentBatchConfig"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_nameNormalized_empresaId_key" ON "Supplier"("nameNormalized", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategory_nameNormalized_empresaId_key" ON "SupplierCategory"("nameNormalized", "empresaId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCategory" ADD CONSTRAINT "SupplierCategory_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchConfig" ADD CONSTRAINT "PaymentBatchConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCategory" ADD CONSTRAINT "BillCategory_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
