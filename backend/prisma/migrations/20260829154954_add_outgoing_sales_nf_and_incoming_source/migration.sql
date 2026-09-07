-- CreateEnum
CREATE TYPE "IncomingNfSource" AS ENUM ('SEFAZ', 'XML_UPLOAD');

-- AlterTable
ALTER TABLE "IncomingGoodsNf" ADD COLUMN     "source" "IncomingNfSource" NOT NULL DEFAULT 'SEFAZ';

-- CreateTable
CREATE TABLE "OutgoingSalesNf" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "recipientCnpj" TEXT,
    "recipientName" TEXT,
    "value" DECIMAL(10,2) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "referenceMonth" TEXT NOT NULL,
    "situacao" TEXT,
    "fileUrl" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,
    "ignored" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OutgoingSalesNf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutgoingSalesNf_storeId_idx" ON "OutgoingSalesNf"("storeId");

-- CreateIndex
CREATE INDEX "OutgoingSalesNf_referenceMonth_idx" ON "OutgoingSalesNf"("referenceMonth");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingSalesNf_storeId_chaveAcesso_key" ON "OutgoingSalesNf"("storeId", "chaveAcesso");

-- AddForeignKey
ALTER TABLE "OutgoingSalesNf" ADD CONSTRAINT "OutgoingSalesNf_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingSalesNf" ADD CONSTRAINT "OutgoingSalesNf_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
