-- CreateEnum
CREATE TYPE "BillPaymentMethod" AS ENUM ('BANK_SLIP', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'FLASH', 'BANK_TRANSFER', 'COMPANY_ACCOUNT');

-- CreateEnum
CREATE TYPE "PixKeyType" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM', 'EVP');

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankAgency" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "beneficiary" TEXT,
ADD COLUMN     "paymentMethod" "BillPaymentMethod" NOT NULL DEFAULT 'BANK_SLIP',
ADD COLUMN     "paymentProofUrl" TEXT,
ADD COLUMN     "pixKey" TEXT,
ADD COLUMN     "pixKeyType" "PixKeyType",
ADD COLUMN     "pixQrCode" TEXT;

-- CreateIndex
CREATE INDEX "Bill_paymentMethod_idx" ON "Bill"("paymentMethod");

-- CreateIndex
CREATE INDEX "Bill_barcode_idx" ON "Bill"("barcode");

-- CreateIndex
CREATE INDEX "Bill_pixKey_idx" ON "Bill"("pixKey");
