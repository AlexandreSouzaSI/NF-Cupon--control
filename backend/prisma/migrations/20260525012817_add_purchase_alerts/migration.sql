-- CreateEnum
CREATE TYPE "PurchaseAlertType" AS ENUM ('HIGH_VALUE', 'MISSING_SUPPLIER', 'WAITING_INVOICE', 'REPEATED_SUPPLIER', 'SUSPICIOUS_DESCRIPTION', 'CARD_USAGE');

-- CreateEnum
CREATE TYPE "PurchaseAlertLevel" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "PurchaseAlert" (
    "id" TEXT NOT NULL,
    "type" "PurchaseAlertType" NOT NULL,
    "level" "PurchaseAlertLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseAlert_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseAlert" ADD CONSTRAINT "PurchaseAlert_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
