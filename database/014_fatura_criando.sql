-- Espelha prisma/migrations/20261029180000_fatura_criando.
-- Não aplicar em produção por este arquivo. A fonte da verdade é o Prisma Migrate.

ALTER TABLE "faturas" ALTER COLUMN "asaas_payment_id" DROP NOT NULL;

ALTER TABLE "faturas" ADD COLUMN "chave_idempotencia" TEXT;
ALTER TABLE "faturas" ADD COLUMN "erro_emissao" TEXT;

CREATE UNIQUE INDEX "faturas_empresa_id_chave_idempotencia_key"
ON "faturas" ("empresa_id", "chave_idempotencia");

CREATE UNIQUE INDEX "faturas_criando_por_cliente"
ON "faturas" ("empresa_id", "cliente_id")
WHERE "status" = 'CRIANDO';
