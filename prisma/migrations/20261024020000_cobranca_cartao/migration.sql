-- Cartão de crédito entra como forma. O número e o CVV não são colunas deste banco.
ALTER TABLE "clientes_servicos" DROP CONSTRAINT "clientes_servicos_forma_cobranca_recorrente_check";

ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_forma_cobranca_recorrente_check" CHECK ("forma_cobranca_recorrente" IS NULL OR "forma_cobranca_recorrente" IN ('BOLETO', 'PIX', 'UNDEFINED', 'CREDIT_CARD'));

ALTER TABLE "preferencias_cobranca" DROP CONSTRAINT "preferencias_cobranca_forma_cobranca_check";

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_forma_cobranca_check" CHECK ("forma_cobranca" IN ('BOLETO', 'PIX', 'UNDEFINED', 'CREDIT_CARD'));

ALTER TABLE "preferencias_cobranca" ADD COLUMN "modelo_mensagem" TEXT NOT NULL DEFAULT 'Olá, {cliente}. Segue a cobrança de {servico}, no valor de {valor}, com vencimento em {vencimento}: {link}';

ALTER TABLE "preferencias_cobranca" ADD COLUMN "modelo_assunto" TEXT NOT NULL DEFAULT 'Cobrança de {cliente}';

ALTER TABLE "clientes_servicos" ADD COLUMN "url_cobranca" TEXT,
ADD COLUMN "cartao_status" TEXT,
ADD COLUMN "cartao_bandeira" TEXT,
ADD COLUMN "cartao_final" TEXT;

ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_cartao_status_check" CHECK ("cartao_status" IS NULL OR "cartao_status" IN ('AGUARDANDO', 'CADASTRADO', 'RECUSADO'));

ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_cartao_final_check" CHECK ("cartao_final" IS NULL OR "cartao_final" ~ '^[0-9]{4}$');

ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_cartao_bandeira_check" CHECK ("cartao_bandeira" IS NULL OR (char_length("cartao_bandeira") BETWEEN 1 AND 20 AND "cartao_bandeira" !~ '[0-9]{5}'));
