-- WhatsApp: filtrar grupos / telefones autorizados / conversa privada
ALTER TABLE "RecebimentoWhatsapp" ADD COLUMN "gruposPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RecebimentoWhatsapp" ADD COLUMN "telefonesPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RecebimentoWhatsapp" ADD COLUMN "aceitarPrivado" BOOLEAN NOT NULL DEFAULT true;
