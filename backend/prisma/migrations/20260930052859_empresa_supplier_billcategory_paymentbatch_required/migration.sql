/*
  Warnings:

  - Made the column `empresaId` on table `BillCategory` required. This step will fail if there are existing NULL values in that column.
  - Made the column `empresaId` on table `PaymentBatchConfig` required. This step will fail if there are existing NULL values in that column.
  - Made the column `empresaId` on table `Supplier` required. This step will fail if there are existing NULL values in that column.
  - Made the column `empresaId` on table `SupplierCategory` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "BillCategory" DROP CONSTRAINT "BillCategory_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentBatchConfig" DROP CONSTRAINT "PaymentBatchConfig_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "Supplier" DROP CONSTRAINT "Supplier_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "SupplierCategory" DROP CONSTRAINT "SupplierCategory_empresaId_fkey";

-- AlterTable
ALTER TABLE "BillCategory" ALTER COLUMN "empresaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PaymentBatchConfig" ALTER COLUMN "empresaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "empresaId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SupplierCategory" ALTER COLUMN "empresaId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCategory" ADD CONSTRAINT "SupplierCategory_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchConfig" ADD CONSTRAINT "PaymentBatchConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCategory" ADD CONSTRAINT "BillCategory_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
