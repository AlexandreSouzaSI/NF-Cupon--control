-- Vencimento em fim de semana/feriado empurrado pro próximo dia útil
ALTER TABLE "Bill" ADD COLUMN "dueDateOriginal" TIMESTAMP(3);
CREATE INDEX "Bill_recorrenciaId_dueDateOriginal_idx" ON "Bill"("recorrenciaId", "dueDateOriginal");
