-- WhatsApp em grupo: perguntar "de qual loja é?" e direcionar pela resposta
ALTER TABLE "EntradaAutomatica" ADD COLUMN "chatId" TEXT;
ALTER TABLE "EntradaAutomatica" ADD COLUMN "perguntaMsgId" TEXT;
ALTER TABLE "EntradaAutomatica" ADD COLUMN "aguardandoLoja" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EntradaAutomatica" ADD COLUMN "destinoIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "EntradaAutomatica_chatId_aguardandoLoja_idx" ON "EntradaAutomatica"("chatId", "aguardandoLoja");
CREATE INDEX "EntradaAutomatica_perguntaMsgId_idx" ON "EntradaAutomatica"("perguntaMsgId");
