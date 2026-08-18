-- AlterTable
ALTER TABLE "StoreCertificate" ADD COLUMN     "lastNsu" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "IncomingServiceNf" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nsu" BIGINT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "tipoEvento" TEXT,
    "fileUrl" TEXT,
    "generatedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceId" TEXT,

    CONSTRAINT "IncomingServiceNf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomingServiceNf_storeId_idx" ON "IncomingServiceNf"("storeId");

-- CreateIndex
CREATE INDEX "IncomingServiceNf_serviceId_idx" ON "IncomingServiceNf"("serviceId");

-- CreateIndex
CREATE INDEX "IncomingServiceNf_tipoDocumento_idx" ON "IncomingServiceNf"("tipoDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingServiceNf_storeId_chaveAcesso_key" ON "IncomingServiceNf"("storeId", "chaveAcesso");

-- AddForeignKey
ALTER TABLE "IncomingServiceNf" ADD CONSTRAINT "IncomingServiceNf_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingServiceNf" ADD CONSTRAINT "IncomingServiceNf_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
