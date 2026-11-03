-- Endereço do pagador para o boleto do Inter.
-- Só acrescenta colunas nulas em clientes. Não remove nem renomeia nada.
-- asaas_* e o índice parcial faturas_criando_por_cliente ficam como estão.

ALTER TABLE "clientes"
  ADD COLUMN "endereco_cobranca" TEXT,
  ADD COLUMN "numero_cobranca" TEXT,
  ADD COLUMN "complemento_cobranca" TEXT,
  ADD COLUMN "bairro_cobranca" TEXT,
  ADD COLUMN "cep_cobranca" TEXT;
