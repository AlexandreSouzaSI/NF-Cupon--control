-- AlterEnum
ALTER TYPE "StockMovementOrigin" ADD VALUE 'COMPRA_SEM_NF';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "stockLinkedAt" TIMESTAMP(3);
