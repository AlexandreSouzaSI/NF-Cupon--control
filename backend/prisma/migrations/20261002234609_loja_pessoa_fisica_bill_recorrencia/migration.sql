/*
  Warnings:

  - You are about to drop the `BankStatementImport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FinancialCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FinancialClassificationRule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FinancialTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Truck` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoPessoaStore" AS ENUM ('JURIDICA', 'FISICA');

-- CreateEnum
CREATE TYPE "BillRecurrenceType" AS ENUM ('WEEKLY', 'MONTHLY');

-- DropForeignKey
ALTER TABLE "BankStatementImport" DROP CONSTRAINT "BankStatementImport_createdById_fkey";

-- DropForeignKey
ALTER TABLE "BankStatementImport" DROP CONSTRAINT "BankStatementImport_storeId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialClassificationRule" DROP CONSTRAINT "FinancialClassificationRule_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialClassificationRule" DROP CONSTRAINT "FinancialClassificationRule_truckId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialTransaction" DROP CONSTRAINT "FinancialTransaction_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialTransaction" DROP CONSTRAINT "FinancialTransaction_importId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialTransaction" DROP CONSTRAINT "FinancialTransaction_storeId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialTransaction" DROP CONSTRAINT "FinancialTransaction_truckId_fkey";

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "telefoneAvisoDiario" TEXT,
ADD COLUMN     "tipoPessoa" "TipoPessoaStore" NOT NULL DEFAULT 'JURIDICA';

-- DropTable
DROP TABLE "BankStatementImport";

-- DropTable
DROP TABLE "FinancialCategory";

-- DropTable
DROP TABLE "FinancialClassificationRule";

-- DropTable
DROP TABLE "FinancialTransaction";

-- DropTable
DROP TABLE "Truck";

-- DropEnum
DROP TYPE "FinancialTransactionDirection";

-- DropEnum
DROP TYPE "FinancialTransactionStatus";

-- CreateTable
CREATE TABLE "BillRecorrencia" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "recurrence" "BillRecurrenceType" NOT NULL,
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "type" "PayableType" NOT NULL DEFAULT 'BOLETO',
    "paymentMethod" "BillPaymentMethod" NOT NULL DEFAULT 'BANK_SLIP',
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT,
    "supplierId" TEXT,
    "createdById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillRecorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillRecorrencia_storeId_idx" ON "BillRecorrencia"("storeId");

-- CreateIndex
CREATE INDEX "BillRecorrencia_active_idx" ON "BillRecorrencia"("active");

-- AddForeignKey
ALTER TABLE "BillRecorrencia" ADD CONSTRAINT "BillRecorrencia_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRecorrencia" ADD CONSTRAINT "BillRecorrencia_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BillCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRecorrencia" ADD CONSTRAINT "BillRecorrencia_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRecorrencia" ADD CONSTRAINT "BillRecorrencia_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
