-- Dia em que o cliente pagou a fatura.
-- Só acrescenta coluna. Não altera o índice parcial faturas_criando_por_cliente.

ALTER TABLE "faturas" ADD COLUMN "pago_em" DATE;
