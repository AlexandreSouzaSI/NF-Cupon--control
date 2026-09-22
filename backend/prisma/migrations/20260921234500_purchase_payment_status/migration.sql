-- CreateEnum
CREATE TYPE "PurchasePaymentStatus" AS ENUM ('TO_PAY', 'PAID');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "paymentStatus" "PurchasePaymentStatus" NOT NULL DEFAULT 'TO_PAY';
