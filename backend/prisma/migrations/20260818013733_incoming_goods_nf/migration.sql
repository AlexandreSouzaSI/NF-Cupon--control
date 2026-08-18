-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "uf" TEXT;

-- AlterTable
ALTER TABLE "StoreCertificate" ADD COLUMN     "lastNsuNfe" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "IncomingGoodsNf" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nsu" BIGINT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "issuerCnpj" TEXT,
    "issuerName" TEXT,
    "value" DECIMAL(10,2),
    "issueDate" TIMESTAMP(3),
    "situacao" TEXT,
    "fileUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseId" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "IncomingGoodsNf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomingGoodsNf_storeId_idx" ON "IncomingGoodsNf"("storeId");

-- CreateIndex
CREATE INDEX "IncomingGoodsNf_purchaseId_idx" ON "IncomingGoodsNf"("purchaseId");

-- CreateIndex
CREATE INDEX "IncomingGoodsNf_tipoDocumento_idx" ON "IncomingGoodsNf"("tipoDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingGoodsNf_storeId_chaveAcesso_key" ON "IncomingGoodsNf"("storeId", "chaveAcesso");

-- AddForeignKey
ALTER TABLE "IncomingGoodsNf" ADD CONSTRAINT "IncomingGoodsNf_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingGoodsNf" ADD CONSTRAINT "IncomingGoodsNf_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
