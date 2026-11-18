-- Promessa combinada no WhatsApp.
-- Só acrescenta tipo, colunas, tabelas, índices, funções e gatilhos.
-- Não apaga dado. registrada_por_id passa a aceitar nulo: o cliente não é um usuário.

CREATE TYPE "origem_promessa" AS ENUM ('PAINEL', 'WHATSAPP');

ALTER TABLE "promessas_pagamento"
  ADD COLUMN "origem" "origem_promessa" NOT NULL DEFAULT 'PAINEL';

ALTER TABLE "promessas_pagamento"
  ALTER COLUMN "registrada_por_id" DROP NOT NULL;

ALTER TABLE "empresas"
  ADD COLUMN "prazo_maximo_promessa_dias" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "empresas"
  ADD CONSTRAINT "empresas_prazo_maximo_promessa_dias_check"
  CHECK ("prazo_maximo_promessa_dias" BETWEEN 1 AND 90);

ALTER TABLE "respostas_whatsapp"
  ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'EQUIPE';

-- Quem registrou, quando existe, continua da mesma empresa.
CREATE OR REPLACE FUNCTION "promessas_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "faturas"
    WHERE "id" = NEW."fatura_id" AND "empresa_id" = NEW."empresa_id" AND "cliente_id" = NEW."cliente_id"
  ) THEN
    RAISE EXCEPTION 'promessa_fatura_outra_empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "clientes"
    WHERE "id" = NEW."cliente_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'promessa_cliente_outra_empresa';
  END IF;

  IF NEW."registrada_por_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "usuarios"
    WHERE "id" = NEW."registrada_por_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'promessa_usuario_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "promessas_mesma_empresa"() FROM PUBLIC;

-- Token do botão. O valor é opaco: a aplicação não grava o id da fatura dentro dele.
CREATE TABLE "tokens_promessa_whatsapp" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "fatura_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tokens_promessa_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tokens_promessa_whatsapp_token_key" ON "tokens_promessa_whatsapp"("token");

CREATE INDEX "tokens_promessa_whatsapp_empresa_id_fatura_id_idx" ON "tokens_promessa_whatsapp"("empresa_id", "fatura_id");

CREATE INDEX "tokens_promessa_whatsapp_empresa_id_idx" ON "tokens_promessa_whatsapp"("empresa_id");

ALTER TABLE "tokens_promessa_whatsapp" ADD CONSTRAINT "tokens_promessa_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tokens_promessa_whatsapp" ADD CONSTRAINT "tokens_promessa_whatsapp_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tokens_promessa_whatsapp" ADD CONSTRAINT "tokens_promessa_whatsapp_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Estado curto da escolha da data. Uma conversa aberta por telefone da empresa.
CREATE TABLE "conversas_promessa_whatsapp" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "fatura_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversas_promessa_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversas_promessa_whatsapp_empresa_id_telefone_key" ON "conversas_promessa_whatsapp"("empresa_id", "telefone");

CREATE INDEX "conversas_promessa_whatsapp_empresa_id_fatura_id_idx" ON "conversas_promessa_whatsapp"("empresa_id", "fatura_id");

ALTER TABLE "conversas_promessa_whatsapp" ADD CONSTRAINT "conversas_promessa_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversas_promessa_whatsapp" ADD CONSTRAINT "conversas_promessa_whatsapp_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversas_promessa_whatsapp" ADD CONSTRAINT "conversas_promessa_whatsapp_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "token_promessa_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "faturas"
    WHERE "id" = NEW."fatura_id" AND "empresa_id" = NEW."empresa_id" AND "cliente_id" = NEW."cliente_id"
  ) THEN
    RAISE EXCEPTION 'token_promessa_outra_empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "clientes"
    WHERE "id" = NEW."cliente_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'token_promessa_cliente_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "token_promessa_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "token_promessa_mesma_empresa"
BEFORE INSERT OR UPDATE ON "tokens_promessa_whatsapp"
FOR EACH ROW
EXECUTE FUNCTION "token_promessa_mesma_empresa"();

CREATE FUNCTION "conversa_promessa_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "faturas"
    WHERE "id" = NEW."fatura_id" AND "empresa_id" = NEW."empresa_id" AND "cliente_id" = NEW."cliente_id"
  ) THEN
    RAISE EXCEPTION 'conversa_promessa_outra_empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "clientes"
    WHERE "id" = NEW."cliente_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'conversa_promessa_cliente_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "conversa_promessa_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "conversa_promessa_mesma_empresa"
BEFORE INSERT OR UPDATE ON "conversas_promessa_whatsapp"
FOR EACH ROW
EXECUTE FUNCTION "conversa_promessa_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê estas tabelas.
ALTER TABLE "tokens_promessa_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversas_promessa_whatsapp" ENABLE ROW LEVEL SECURITY;
