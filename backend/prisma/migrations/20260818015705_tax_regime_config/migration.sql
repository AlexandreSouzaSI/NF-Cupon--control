-- CreateEnum
CREATE TYPE "TaxRegimeType" AS ENUM ('SIMPLES', 'PRESUMIDO', 'REAL');

-- CreateEnum
CREATE TYPE "RevenueSource" AS ENUM ('MANUAL', 'IMPORTED_XML');

-- CreateTable
CREATE TABLE "TaxRegimeConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "regime" "TaxRegimeType" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "simplesAnexo" TEXT,
    "presumidoIrpjPercent" DECIMAL(5,2),
    "presumidoCsllPercent" DECIMAL(5,2),
    "presumidoPisCofinsPercent" DECIMAL(5,2),
    "realPisCofinsPercent" DECIMAL(5,2),
    "icmsRegimeEspecialMg" BOOLEAN NOT NULL DEFAULT false,
    "icmsAliquotaRefeicao" DECIMAL(5,2),
    "icmsAliquotaOutras" DECIMAL(5,2),
    "icmsAliquotaPadrao" DECIMAL(5,2),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRegimeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "referenceMonth" TEXT NOT NULL,
    "grossRevenue" DECIMAL(12,2) NOT NULL,
    "source" "RevenueSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxRegimeConfig_storeId_idx" ON "TaxRegimeConfig"("storeId");

-- CreateIndex
CREATE INDEX "TaxRegimeConfig_effectiveFrom_idx" ON "TaxRegimeConfig"("effectiveFrom");

-- CreateIndex
CREATE INDEX "RevenueEntry_storeId_idx" ON "RevenueEntry"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueEntry_storeId_referenceMonth_key" ON "RevenueEntry"("storeId", "referenceMonth");

-- AddForeignKey
ALTER TABLE "TaxRegimeConfig" ADD CONSTRAINT "TaxRegimeConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRegimeConfig" ADD CONSTRAINT "TaxRegimeConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
