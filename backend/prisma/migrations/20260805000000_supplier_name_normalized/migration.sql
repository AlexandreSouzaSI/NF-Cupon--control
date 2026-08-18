-- Extensão do Postgres usada só para remover acento no backfill abaixo.
-- Vem por padrão nas imagens oficiais do Postgres (contrib).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "nameNormalized" TEXT;

-- Backfill: preenche a coluna nova pros fornecedores que já existem,
-- normalizando do mesmo jeito que o backend vai normalizar daqui pra frente
-- (minúsculo, sem acento, sem espaço duplicado nas pontas).
UPDATE "Supplier"
SET "nameNormalized" = lower(unaccent(trim(name)))
WHERE "nameNormalized" IS NULL;

-- Se dois fornecedores já cadastrados normalizarem pro mesmo nome
-- (ex.: "Distribuidora Souza" e "distribuidora souza"), o passo abaixo
-- falha com erro de valor duplicado. Nesse caso, um dos dois precisa ser
-- renomeado ou desativado manualmente antes de rodar de novo.
ALTER TABLE "Supplier" ALTER COLUMN "nameNormalized" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_nameNormalized_key" ON "Supplier"("nameNormalized");
