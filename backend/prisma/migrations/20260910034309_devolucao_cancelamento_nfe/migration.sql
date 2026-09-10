-- CreateEnum
CREATE TYPE "DevolucaoNfeStatus" AS ENUM ('RASCUNHO', 'ENVIADA', 'AUTORIZADA', 'REJEITADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "devolucaoNfeNextNumber" INTEGER,
ADD COLUMN     "devolucaoNfeSerie" INTEGER;

-- CreateTable
CREATE TABLE "DevolucaoNfe" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "incomingGoodsNfId" TEXT NOT NULL,
    "refChaveAcesso" TEXT NOT NULL,
    "status" "DevolucaoNfeStatus" NOT NULL DEFAULT 'RASCUNHO',
    "ambiente" INTEGER NOT NULL DEFAULT 2,
    "serie" INTEGER,
    "numero" INTEGER,
    "chaveAcesso" TEXT,
    "issueDate" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,
    "xmlFileUrl" TEXT,
    "protocolo" TEXT,
    "statusMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevolucaoNfe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucaoNfeItem" (
    "id" TEXT NOT NULL,
    "devolucaoNfeId" TEXT NOT NULL,
    "nItemOrigem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "ncm" TEXT,
    "cfopOrigem" TEXT NOT NULL,
    "cfopDevolucao" TEXT NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "unidade" TEXT NOT NULL,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "DevolucaoNfeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevolucaoNfe_storeId_idx" ON "DevolucaoNfe"("storeId");

-- CreateIndex
CREATE INDEX "DevolucaoNfe_incomingGoodsNfId_idx" ON "DevolucaoNfe"("incomingGoodsNfId");

-- CreateIndex
CREATE INDEX "DevolucaoNfeItem_devolucaoNfeId_idx" ON "DevolucaoNfeItem"("devolucaoNfeId");

-- AddForeignKey
ALTER TABLE "DevolucaoNfe" ADD CONSTRAINT "DevolucaoNfe_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucaoNfe" ADD CONSTRAINT "DevolucaoNfe_incomingGoodsNfId_fkey" FOREIGN KEY ("incomingGoodsNfId") REFERENCES "IncomingGoodsNf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucaoNfe" ADD CONSTRAINT "DevolucaoNfe_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucaoNfeItem" ADD CONSTRAINT "DevolucaoNfeItem_devolucaoNfeId_fkey" FOREIGN KEY ("devolucaoNfeId") REFERENCES "DevolucaoNfe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
