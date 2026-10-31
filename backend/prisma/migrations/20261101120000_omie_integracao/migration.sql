-- Integração Omie → Contas a Pagar (uma por loja)
ALTER TABLE "Bill" ADD COLUMN "omieCodigo" TEXT;
CREATE UNIQUE INDEX "Bill_storeId_omieCodigo_key" ON "Bill"("storeId", "omieCodigo");

CREATE TABLE "OmieIntegracao" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "appKey" TEXT NOT NULL,
    "appSecretCifrado" JSONB NOT NULL,
    "empresaOmie" TEXT,
    "resultado" JSONB,
    "ultimaSincronizacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OmieIntegracao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OmieIntegracao_storeId_key" ON "OmieIntegracao"("storeId");
ALTER TABLE "OmieIntegracao" ADD CONSTRAINT "OmieIntegracao_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
