-- Corrige de novo o valor padrão de cClassTrib na LossNfe: "410031"
-- (migração anterior) também foi rejeitado pela Sefaz (1200 -
-- "cClassTrib incompativel com o tipo de Nota de Debito"). A regra
-- UB14-70 só aceita "410030" (Estorno de crédito por
-- perecimento/deterioração/roubo/furto/extravio) combinado com
-- tpNFDebito=07. Só muda o default da coluna pra novas notas — não
-- altera nenhuma NF já gravada.
ALTER TABLE "LossNfe" ALTER COLUMN "cClassTrib" SET DEFAULT '410030';
