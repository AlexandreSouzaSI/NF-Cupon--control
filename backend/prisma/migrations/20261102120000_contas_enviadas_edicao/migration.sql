-- Lançar Contas: edição antes de lançar + NF do sistema atrelada
ALTER TABLE "ContaEnviada" ADD COLUMN "tipoConta" TEXT;
ALTER TABLE "ContaEnviada" ADD COLUMN "formaPagamento" TEXT;
ALTER TABLE "ContaEnviada" ADD COLUMN "observacaoConferencia" TEXT;
ALTER TABLE "ContaEnviada" ADD COLUMN "nfEntradaId" TEXT;
ALTER TABLE "ContaEnviada" ADD COLUMN "nfServicoId" TEXT;
CREATE INDEX "ContaEnviada_nfEntradaId_idx" ON "ContaEnviada"("nfEntradaId");
