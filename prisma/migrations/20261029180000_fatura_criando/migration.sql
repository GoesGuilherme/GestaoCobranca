-- A fatura nasce antes da chamada ao Asaas. asaas_payment_id fica vazio
-- enquanto status = 'CRIANDO'. O índice parcial impede duas emissões
-- ao mesmo tempo para o mesmo cliente na mesma empresa.

ALTER TABLE "faturas" ALTER COLUMN "asaas_payment_id" DROP NOT NULL;

ALTER TABLE "faturas" ADD COLUMN "chave_idempotencia" TEXT;
ALTER TABLE "faturas" ADD COLUMN "erro_emissao" TEXT;

CREATE UNIQUE INDEX "faturas_empresa_id_chave_idempotencia_key"
ON "faturas" ("empresa_id", "chave_idempotencia");

CREATE UNIQUE INDEX "faturas_criando_por_cliente"
ON "faturas" ("empresa_id", "cliente_id")
WHERE "status" = 'CRIANDO';
