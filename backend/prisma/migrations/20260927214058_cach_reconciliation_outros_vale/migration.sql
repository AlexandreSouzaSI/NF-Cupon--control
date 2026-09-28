-- AlterTable
ALTER TABLE "CashReconciliation" ADD COLUMN     "otherBank" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherDescription" TEXT,
ADD COLUMN     "otherSystem" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withdrawalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withdrawalReason" TEXT;
