-- Corrige o valor padrão de cClassTrib na LossNfe: a Sefaz rejeitou (1200 -
-- "cClassTrib incompativel com o tipo de Nota de Debito") o valor de
-- exemplo "410001". O código certo pra Perda em Estoque (tpNFDebito=07)
-- quando a compra original NÃO teve IBS/CBS destacado (caso mais comum
-- hoje, 2026 ainda é período de transição) é "410031". Só muda o default
-- da coluna pra novas notas — não altera nenhuma NF já gravada.
ALTER TABLE "LossNfe" ALTER COLUMN "cClassTrib" SET DEFAULT '410031';
