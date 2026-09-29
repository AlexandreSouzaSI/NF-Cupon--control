-- CreateEnum
CREATE TYPE "PurchaseFiscalStatus" AS ENUM ('PENDING', 'COUPON_ONLY', 'INVOICE');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "fiscalStatus" "PurchaseFiscalStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Purchase_fiscalStatus_idx" ON "Purchase"("fiscalStatus");
