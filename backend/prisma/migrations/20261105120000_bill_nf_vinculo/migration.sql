-- Conta a Pagar → NF do sistema (várias parcelas podem apontar para a mesma NF)
ALTER TABLE "Bill" ADD COLUMN "nfEntradaId" TEXT;
ALTER TABLE "Bill" ADD COLUMN "nfServicoId" TEXT;
CREATE INDEX "Bill_nfEntradaId_idx" ON "Bill"("nfEntradaId");
CREATE INDEX "Bill_nfServicoId_idx" ON "Bill"("nfServicoId");
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_nfEntradaId_fkey" FOREIGN KEY ("nfEntradaId") REFERENCES "IncomingGoodsNf"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_nfServicoId_fkey" FOREIGN KEY ("nfServicoId") REFERENCES "IncomingServiceNf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vínculos que já existiam (NF aceita que gerou a conta)
UPDATE "Bill" b SET "nfEntradaId" = n."id" FROM "IncomingGoodsNf" n WHERE n."billId" = b."id" AND b."nfEntradaId" IS NULL;
UPDATE "Bill" b SET "nfServicoId" = n."id" FROM "IncomingServiceNf" n WHERE n."billId" = b."id" AND b."nfServicoId" IS NULL;
