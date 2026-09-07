-- CreateEnum
CREATE TYPE "LossNfeStatus" AS ENUM ('RASCUNHO', 'ENVIADA', 'AUTORIZADA', 'REJEITADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "ProductLoss" ADD COLUMN     "lossNfeId" TEXT,
ADD COLUMN     "unitValue" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "lossNfeNextNumber" INTEGER,
ADD COLUMN     "lossNfeSerie" INTEGER;

-- CreateTable
CREATE TABLE "LossNfe" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "LossNfeStatus" NOT NULL DEFAULT 'RASCUNHO',
    "ambiente" INTEGER NOT NULL DEFAULT 2,
    "serie" INTEGER,
    "numero" INTEGER,
    "chaveAcesso" TEXT,
    "issueDate" TIMESTAMP(3),
    "justificativa" TEXT NOT NULL,
    "xmlFileUrl" TEXT,
    "protocolo" TEXT,
    "statusMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LossNfe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LossNfe_storeId_idx" ON "LossNfe"("storeId");

-- CreateIndex
CREATE INDEX "ProductLoss_lossNfeId_idx" ON "ProductLoss"("lossNfeId");

-- AddForeignKey
ALTER TABLE "ProductLoss" ADD CONSTRAINT "ProductLoss_lossNfeId_fkey" FOREIGN KEY ("lossNfeId") REFERENCES "LossNfe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossNfe" ADD CONSTRAINT "LossNfe_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossNfe" ADD CONSTRAINT "LossNfe_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
