-- Camada comum de provedor de pagamento.
-- Só adiciona tipo, colunas, tabelas, índices, função e gatilho.
-- Não remove nem renomeia coluna. asaas_* e faturas_criando_por_cliente ficam.
-- O backfill é idempotente: só preenche o que ainda está vazio ou divergente
-- do mapa do Asaas, e pode ser executado de novo com o mesmo resultado.

CREATE TYPE "provedor_pagamento" AS ENUM ('ASAAS', 'CORA', 'INTER', 'EFI', 'SICOOB', 'SICREDI');

ALTER TABLE "empresas"
  ADD COLUMN "provedor_pagamento" "provedor_pagamento" NOT NULL DEFAULT 'ASAAS';

ALTER TABLE "faturas"
  ADD COLUMN "provedor" "provedor_pagamento" NOT NULL DEFAULT 'ASAAS',
  ADD COLUMN "id_externo" TEXT,
  ADD COLUMN "status_normalizado" TEXT;

ALTER TABLE "clientes"
  ADD COLUMN "id_externo" TEXT;

ALTER TABLE "clientes_servicos"
  ADD COLUMN "id_assinatura_externa" TEXT;

CREATE TABLE "configuracoes_pagamento" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "provedor" "provedor_pagamento" NOT NULL,
  "ambiente" TEXT NOT NULL,
  "credenciais_cifradas" TEXT NOT NULL,
  "certificado_cifrado" TEXT,
  "chave_privada_cifrada" TEXT,
  "certificado_valido_ate" TIMESTAMPTZ(3),
  "segredo_webhook_cifrado" TEXT,
  "segredo_webhook_hash" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "configuracoes_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eventos_pagamento" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "provedor" "provedor_pagamento" NOT NULL,
  "id_evento_externo" TEXT NOT NULL,
  "id_externo" TEXT,
  "tipo" TEXT NOT NULL,
  "status_normalizado" TEXT,
  "bruto" JSONB,
  "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "eventos_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_pagamento_empresa_id_provedor_key"
  ON "configuracoes_pagamento"("empresa_id", "provedor");

CREATE UNIQUE INDEX "configuracoes_pagamento_segredo_webhook_hash_key"
  ON "configuracoes_pagamento"("segredo_webhook_hash");

CREATE INDEX "configuracoes_pagamento_empresa_id_idx"
  ON "configuracoes_pagamento"("empresa_id");

CREATE UNIQUE INDEX "eventos_pagamento_empresa_id_provedor_id_evento_externo_key"
  ON "eventos_pagamento"("empresa_id", "provedor", "id_evento_externo");

CREATE INDEX "eventos_pagamento_empresa_id_idx"
  ON "eventos_pagamento"("empresa_id");

CREATE INDEX "eventos_pagamento_empresa_id_id_externo_idx"
  ON "eventos_pagamento"("empresa_id", "id_externo");

CREATE UNIQUE INDEX "clientes_servicos_id_assinatura_externa_key"
  ON "clientes_servicos"("id_assinatura_externa");

CREATE INDEX "clientes_id_externo_idx"
  ON "clientes"("id_externo");

CREATE UNIQUE INDEX "faturas_empresa_provedor_id_externo_key"
  ON "faturas"("empresa_id", "provedor", "id_externo")
  WHERE "id_externo" IS NOT NULL;

CREATE INDEX "faturas_empresa_id_excluida_status_normalizado_idx"
  ON "faturas"("empresa_id", "excluida", "status_normalizado");

ALTER TABLE "configuracoes_pagamento"
  ADD CONSTRAINT "configuracoes_pagamento_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "eventos_pagamento"
  ADD CONSTRAINT "eventos_pagamento_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Espelha MAPA_ASAAS em src/lib/status-pagamento.ts.
-- Status desconhecido fica nulo, para não entrar em pendente nem em pago.
CREATE OR REPLACE FUNCTION status_normalizado_asaas(status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE status
    WHEN 'PENDING' THEN 'PENDENTE'
    WHEN 'AWAITING_RISK_ANALYSIS' THEN 'PENDENTE'
    WHEN 'OVERDUE' THEN 'VENCIDO'
    WHEN 'DUNNING_REQUESTED' THEN 'VENCIDO'
    WHEN 'RECEIVED' THEN 'PAGO'
    WHEN 'CONFIRMED' THEN 'PAGO'
    WHEN 'RECEIVED_IN_CASH' THEN 'PAGO'
    WHEN 'DUNNING_RECEIVED' THEN 'PAGO'
    WHEN 'REFUNDED' THEN 'ESTORNADO'
    WHEN 'REFUND_REQUESTED' THEN 'ESTORNADO'
    WHEN 'REFUND_IN_PROGRESS' THEN 'ESTORNADO'
    WHEN 'CHARGEBACK_REQUESTED' THEN 'ESTORNADO'
    WHEN 'CHARGEBACK_DISPUTE' THEN 'ESTORNADO'
    WHEN 'AWAITING_CHARGEBACK_REVERSAL' THEN 'ESTORNADO'
    WHEN 'CRIANDO' THEN 'CRIANDO'
    WHEN 'ERRO_EMISSAO' THEN 'FALHA'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION faturas_sincronizar_status_normalizado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provedor IS DISTINCT FROM 'ASAAS'::"provedor_pagamento" THEN
    RETURN NEW;
  END IF;
  NEW.status_normalizado := status_normalizado_asaas(NEW.status);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS faturas_status_normalizado ON "faturas";

CREATE TRIGGER faturas_status_normalizado
BEFORE INSERT OR UPDATE OF status, provedor
ON "faturas"
FOR EACH ROW
EXECUTE FUNCTION faturas_sincronizar_status_normalizado();

-- Backfill idempotente. Rodar de novo não troca id já preenchido
-- nem reescreve status_normalizado que já bate com o mapa.
UPDATE "faturas"
SET "id_externo" = "asaas_payment_id"
WHERE "provedor" = 'ASAAS'
  AND "id_externo" IS NULL
  AND "asaas_payment_id" IS NOT NULL;

UPDATE "faturas"
SET "status_normalizado" = status_normalizado_asaas("status")
WHERE "provedor" = 'ASAAS'
  AND "status_normalizado" IS DISTINCT FROM status_normalizado_asaas("status");

UPDATE "clientes"
SET "id_externo" = "asaas_customer_id"
WHERE "id_externo" IS NULL
  AND "asaas_customer_id" IS NOT NULL;

UPDATE "clientes_servicos"
SET "id_assinatura_externa" = "asaas_subscription_id"
WHERE "id_assinatura_externa" IS NULL
  AND "asaas_subscription_id" IS NOT NULL;
