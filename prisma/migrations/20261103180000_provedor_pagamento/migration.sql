-- Camada comum de provedor de pagamento.
-- Só acrescenta coluna, índice, tabela e gatilho.
-- Não remove nem renomeia coluna asaas_* e não mexe no índice parcial faturas_criando_por_cliente.
--
-- Backfill idempotente (pode rodar de novo sem mudar o resultado):
--   faturas.id_externo = asaas_payment_id quando o provedor é ASAAS
--   faturas.status_normalizado = tradução do status cru do Asaas
--   clientes.id_externo = asaas_customer_id
--   clientes_servicos.id_assinatura_externa = asaas_subscription_id
-- O gatilho mantém esses espelhos em todo INSERT/UPDATE de linha ASAAS.
-- Linha de outro provedor não é reescrita: o conector grava o status normalizado.

ALTER TABLE "empresas" ADD COLUMN "provedor_pagamento" TEXT NOT NULL DEFAULT 'ASAAS';

ALTER TABLE "clientes" ADD COLUMN "provedor" TEXT NOT NULL DEFAULT 'ASAAS';
ALTER TABLE "clientes" ADD COLUMN "id_externo" TEXT;

ALTER TABLE "clientes_servicos" ADD COLUMN "provedor" TEXT NOT NULL DEFAULT 'ASAAS';
ALTER TABLE "clientes_servicos" ADD COLUMN "id_assinatura_externa" TEXT;

ALTER TABLE "faturas" ADD COLUMN "provedor" TEXT NOT NULL DEFAULT 'ASAAS';
ALTER TABLE "faturas" ADD COLUMN "id_externo" TEXT;
ALTER TABLE "faturas" ADD COLUMN "status_normalizado" TEXT;

-- A mesma tabela do src/lib/status-cobranca.ts. Se uma mudar, a outra muda junto.
CREATE FUNCTION "status_normalizado_asaas"(status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(status)
    WHEN 'CRIANDO' THEN 'CRIANDO'
    WHEN 'ERRO_EMISSAO' THEN 'FALHA'
    WHEN 'PENDING' THEN 'PENDENTE'
    WHEN 'AWAITING_RISK_ANALYSIS' THEN 'PENDENTE'
    WHEN 'OVERDUE' THEN 'VENCIDA'
    WHEN 'DUNNING_REQUESTED' THEN 'VENCIDA'
    WHEN 'RECEIVED' THEN 'PAGA'
    WHEN 'CONFIRMED' THEN 'PAGA'
    WHEN 'RECEIVED_IN_CASH' THEN 'PAGA'
    WHEN 'DUNNING_RECEIVED' THEN 'PAGA'
    WHEN 'REFUNDED' THEN 'ESTORNADA'
    WHEN 'REFUND_REQUESTED' THEN 'ESTORNADA'
    WHEN 'REFUND_IN_PROGRESS' THEN 'ESTORNADA'
    WHEN 'CHARGEBACK_REQUESTED' THEN 'ESTORNADA'
    WHEN 'CHARGEBACK_DISPUTE' THEN 'ESTORNADA'
    WHEN 'AWAITING_CHARGEBACK_REVERSAL' THEN 'ESTORNADA'
    ELSE 'DESCONHECIDO'
  END
$$;

REVOKE ALL ON FUNCTION "status_normalizado_asaas"(text) FROM PUBLIC;

UPDATE "faturas"
SET "id_externo" = "asaas_payment_id"
WHERE "provedor" = 'ASAAS'
  AND "asaas_payment_id" IS NOT NULL
  AND "id_externo" IS DISTINCT FROM "asaas_payment_id";

UPDATE "faturas"
SET "status_normalizado" = "status_normalizado_asaas"("status")
WHERE "provedor" = 'ASAAS'
  AND "status_normalizado" IS DISTINCT FROM "status_normalizado_asaas"("status");

UPDATE "faturas"
SET "status_normalizado" = 'PENDENTE'
WHERE "status_normalizado" IS NULL;

ALTER TABLE "faturas" ALTER COLUMN "status_normalizado" SET DEFAULT 'PENDENTE';
ALTER TABLE "faturas" ALTER COLUMN "status_normalizado" SET NOT NULL;

UPDATE "clientes"
SET "id_externo" = "asaas_customer_id"
WHERE "provedor" = 'ASAAS'
  AND "id_externo" IS DISTINCT FROM "asaas_customer_id";

UPDATE "clientes_servicos"
SET "id_assinatura_externa" = "asaas_subscription_id"
WHERE "provedor" = 'ASAAS'
  AND "id_assinatura_externa" IS DISTINCT FROM "asaas_subscription_id";

CREATE FUNCTION "faturas_espelhar_provedor"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."provedor" IS NULL OR NEW."provedor" = 'ASAAS' THEN
    NEW."provedor" := 'ASAAS';
    NEW."status_normalizado" := "status_normalizado_asaas"(NEW."status");
    IF NEW."asaas_payment_id" IS NOT NULL THEN
      NEW."id_externo" := NEW."asaas_payment_id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "faturas_espelhar_provedor"() FROM PUBLIC;

CREATE TRIGGER "faturas_espelhar_provedor"
BEFORE INSERT OR UPDATE ON "faturas"
FOR EACH ROW
EXECUTE FUNCTION "faturas_espelhar_provedor"();

CREATE FUNCTION "clientes_espelhar_provedor"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."provedor" IS NULL OR NEW."provedor" = 'ASAAS' THEN
    NEW."provedor" := 'ASAAS';
    NEW."id_externo" := NEW."asaas_customer_id";
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "clientes_espelhar_provedor"() FROM PUBLIC;

CREATE TRIGGER "clientes_espelhar_provedor"
BEFORE INSERT OR UPDATE ON "clientes"
FOR EACH ROW
EXECUTE FUNCTION "clientes_espelhar_provedor"();

CREATE FUNCTION "clientes_servicos_espelhar_provedor"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."provedor" IS NULL OR NEW."provedor" = 'ASAAS' THEN
    NEW."provedor" := 'ASAAS';
    NEW."id_assinatura_externa" := NEW."asaas_subscription_id";
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "clientes_servicos_espelhar_provedor"() FROM PUBLIC;

CREATE TRIGGER "clientes_servicos_espelhar_provedor"
BEFORE INSERT OR UPDATE ON "clientes_servicos"
FOR EACH ROW
EXECUTE FUNCTION "clientes_servicos_espelhar_provedor"();

CREATE INDEX "faturas_empresa_id_excluida_status_normalizado_idx"
ON "faturas"("empresa_id", "excluida", "status_normalizado");

CREATE UNIQUE INDEX "faturas_empresa_provedor_id_externo_key"
ON "faturas"("empresa_id", "provedor", "id_externo")
WHERE "id_externo" IS NOT NULL;

CREATE INDEX "clientes_empresa_id_provedor_id_externo_idx"
ON "clientes"("empresa_id", "provedor", "id_externo");

CREATE UNIQUE INDEX "clientes_servicos_id_assinatura_externa_key"
ON "clientes_servicos"("id_assinatura_externa")
WHERE "id_assinatura_externa" IS NOT NULL;

CREATE TABLE "configuracoes_pagamento" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "credenciais_cifradas" TEXT NOT NULL,
    "certificado_cifrado" TEXT,
    "chave_privada_cifrada" TEXT,
    "certificado_valido_ate" TIMESTAMPTZ(3),
    "segredo_webhook_cifrado" TEXT,
    "segredo_webhook_hash" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "configuracoes_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eventos_pagamento" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "id_evento" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "id_externo" TEXT,
    "status_normalizado" TEXT,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_pagamento_empresa_id_provedor_key"
ON "configuracoes_pagamento"("empresa_id", "provedor");

CREATE UNIQUE INDEX "configuracoes_pagamento_segredo_webhook_hash_key"
ON "configuracoes_pagamento"("segredo_webhook_hash");

CREATE INDEX "configuracoes_pagamento_empresa_id_idx"
ON "configuracoes_pagamento"("empresa_id");

CREATE UNIQUE INDEX "eventos_pagamento_empresa_id_provedor_id_evento_key"
ON "eventos_pagamento"("empresa_id", "provedor", "id_evento");

CREATE INDEX "eventos_pagamento_empresa_id_idx"
ON "eventos_pagamento"("empresa_id");

ALTER TABLE "configuracoes_pagamento"
ADD CONSTRAINT "configuracoes_pagamento_empresa_id_fkey"
FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "eventos_pagamento"
ADD CONSTRAINT "eventos_pagamento_empresa_id_fkey"
FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê estas tabelas.
ALTER TABLE "configuracoes_pagamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_pagamento" ENABLE ROW LEVEL SECURITY;
