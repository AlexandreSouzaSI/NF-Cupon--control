/*
  Warnings:

  - You are about to drop the column `otherBank` on the `CashReconciliation` table. All the data in the column will be lost.
  - You are about to drop the column `otherDescription` on the `CashReconciliation` table. All the data in the column will be lost.
  - You are about to drop the column `otherSystem` on the `CashReconciliation` table. All the data in the column will be lost.
  - You are about to drop the column `withdrawalAmount` on the `CashReconciliation` table. All the data in the column will be lost.
  - You are about to drop the column `withdrawalReason` on the `CashReconciliation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CashReconciliation" DROP COLUMN "otherBank",
DROP COLUMN "otherDescription",
DROP COLUMN "otherSystem",
DROP COLUMN "withdrawalAmount",
DROP COLUMN "withdrawalReason";

-- CreateTable
CREATE TABLE "MeepCashExtra" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDay" TEXT NOT NULL,
    "freelancer" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "descontos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "outros" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vale" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeepCashExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeepCashExtra_storeId_idx" ON "MeepCashExtra"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "MeepCashExtra_storeId_businessDay_key" ON "MeepCashExtra"("storeId", "businessDay");

-- AddForeignKey
ALTER TABLE "MeepCashExtra" ADD CONSTRAINT "MeepCashExtra_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeepCashExtra" ADD CONSTRAINT "MeepCashExtra_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
