-- Primeira visualização da fatura ou do boleto pelo pagador.
-- Só acrescenta colunas e um índice. Não altera outras colunas nem índices.

ALTER TABLE "faturas" ADD COLUMN "visualizada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "faturas" ADD COLUMN "visualizada_em" TIMESTAMPTZ(3);

CREATE INDEX "faturas_empresa_id_visualizada_idx" ON "faturas"("empresa_id", "visualizada");
