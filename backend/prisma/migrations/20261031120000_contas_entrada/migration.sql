-- Lançar Contas / Registrar Pagamentos / Conciliação do Extrato / Recebimento automático

-- CreateEnum
CREATE TYPE "ContaEnviadaStatus" AS ENUM ('PENDENTE', 'LANCADA', 'DESCARTADA');
CREATE TYPE "PagamentoAvisadoStatus" AS ENUM ('PENDENTE', 'CONCILIADO', 'DESCARTADO');

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN "conciliacaoExtratoId" TEXT;
ALTER TABLE "Store" ADD COLUMN "tokenEnvioContas" TEXT, ADD COLUMN "tokenAvisoPagamento" TEXT;

-- CreateTable
CREATE TABLE "ContaEnviada" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "storeId" TEXT,
    "lojaPor" TEXT,
    "arquivo" BYTEA,
    "arquivoNome" TEXT,
    "arquivoMime" TEXT,
    "tipoDocumento" TEXT NOT NULL DEFAULT 'OUTRO',
    "fornecedor" TEXT,
    "fornecedorDoc" TEXT,
    "valor" DOUBLE PRECISION,
    "vencimento" TIMESTAMP(3),
    "emissao" TIMESTAMP(3),
    "numeroDocumento" TEXT,
    "codigoBarras" TEXT,
    "chaveNfe" TEXT,
    "descricao" TEXT,
    "parcelas" JSONB,
    "categoryId" TEXT,
    "observacaoEnvio" TEXT,
    "enviadoPorNome" TEXT,
    "origem" TEXT,
    "status" "ContaEnviadaStatus" NOT NULL DEFAULT 'PENDENTE',
    "billIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lancadoEm" TIMESTAMP(3),
    "lancadoPor" TEXT,
    "motivoDescarte" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContaEnviada_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PagamentoAvisado" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "storeId" TEXT,
    "lojaPor" TEXT,
    "fornecedor" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataPagamento" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "comprovante" BYTEA,
    "comprovanteNome" TEXT,
    "comprovanteMime" TEXT,
    "avisadoPorNome" TEXT,
    "idTransacao" TEXT,
    "categoryId" TEXT,
    "status" "PagamentoAvisadoStatus" NOT NULL DEFAULT 'PENDENTE',
    "conciliadoEm" TIMESTAMP(3),
    "conciliadoPor" TEXT,
    "billId" TEXT,
    "observacaoFinanceiro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PagamentoAvisado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConciliacaoExtrato" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "banco" TEXT,
    "arquivos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalPagamentos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRecebimentos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nPagamentos" INTEGER NOT NULL DEFAULT 0,
    "nRecebimentos" INTEGER NOT NULL DEFAULT 0,
    "saldoAnterior" DOUBLE PRECISION,
    "saldoFinal" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "pendenteReaplicar" BOOLEAN NOT NULL DEFAULT false,
    "aplicadoEm" TIMESTAMP(3),
    "aplicadoPor" TEXT,
    "token" TEXT,
    "linkEnviadoEm" TIMESTAMP(3),
    "linkEnviadoPor" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConciliacaoExtrato_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConciliacaoExtratoItem" (
    "id" TEXT NOT NULL,
    "conciliacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "hora" TEXT,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "descricao" TEXT NOT NULL DEFAULT '',
    "valor" DOUBLE PRECISION NOT NULL,
    "partes" JSONB,
    "origem" TEXT,
    "motivo" TEXT,
    "sugestao" TEXT,
    "nota" TEXT,
    "billId" TEXT,
    "baixaFeita" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ConciliacaoExtratoItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConciliacaoVinculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "termo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConciliacaoVinculo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecebimentoWhatsapp" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "instancia" TEXT NOT NULL,
    "segredo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "numero" TEXT,
    "ultimoEvento" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecebimentoWhatsapp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecebimentoEmail" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 993,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "usuario" TEXT NOT NULL,
    "senhaCifrada" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ultimoEvento" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecebimentoEmail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntradaAutomatica" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "storeId" TEXT,
    "canal" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "remetente" TEXT,
    "nomeRemetente" TEXT,
    "assunto" TEXT,
    "arquivoNome" TEXT,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mensagem" TEXT,
    "destinoTipo" TEXT,
    "destinoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntradaAutomatica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bill_conciliacaoExtratoId_idx" ON "Bill"("conciliacaoExtratoId");
CREATE UNIQUE INDEX "Store_tokenEnvioContas_key" ON "Store"("tokenEnvioContas");
CREATE UNIQUE INDEX "Store_tokenAvisoPagamento_key" ON "Store"("tokenAvisoPagamento");
CREATE INDEX "ContaEnviada_empresaId_status_idx" ON "ContaEnviada"("empresaId", "status");
CREATE INDEX "ContaEnviada_storeId_idx" ON "ContaEnviada"("storeId");
CREATE INDEX "ContaEnviada_codigoBarras_idx" ON "ContaEnviada"("codigoBarras");
CREATE INDEX "ContaEnviada_chaveNfe_idx" ON "ContaEnviada"("chaveNfe");
CREATE INDEX "PagamentoAvisado_empresaId_status_idx" ON "PagamentoAvisado"("empresaId", "status");
CREATE INDEX "PagamentoAvisado_storeId_idx" ON "PagamentoAvisado"("storeId");
CREATE INDEX "PagamentoAvisado_idTransacao_idx" ON "PagamentoAvisado"("idTransacao");
CREATE UNIQUE INDEX "ConciliacaoExtrato_token_key" ON "ConciliacaoExtrato"("token");
CREATE INDEX "ConciliacaoExtrato_empresaId_storeId_idx" ON "ConciliacaoExtrato"("empresaId", "storeId");
CREATE INDEX "ConciliacaoExtratoItem_conciliacaoId_idx" ON "ConciliacaoExtratoItem"("conciliacaoId");
CREATE UNIQUE INDEX "ConciliacaoVinculo_empresaId_termo_key" ON "ConciliacaoVinculo"("empresaId", "termo");
CREATE UNIQUE INDEX "RecebimentoWhatsapp_instancia_key" ON "RecebimentoWhatsapp"("instancia");
CREATE UNIQUE INDEX "RecebimentoWhatsapp_segredo_key" ON "RecebimentoWhatsapp"("segredo");
CREATE INDEX "RecebimentoWhatsapp_empresaId_idx" ON "RecebimentoWhatsapp"("empresaId");
CREATE UNIQUE INDEX "RecebimentoEmail_empresaId_key" ON "RecebimentoEmail"("empresaId");
CREATE UNIQUE INDEX "EntradaAutomatica_externoId_key" ON "EntradaAutomatica"("externoId");
CREATE INDEX "EntradaAutomatica_empresaId_createdAt_idx" ON "EntradaAutomatica"("empresaId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConciliacaoExtratoItem" ADD CONSTRAINT "ConciliacaoExtratoItem_conciliacaoId_fkey" FOREIGN KEY ("conciliacaoId") REFERENCES "ConciliacaoExtrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
