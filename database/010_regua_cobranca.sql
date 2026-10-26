-- Espelho de prisma/migrations/20261026180000_regua_cobranca/migration.sql
-- Régua de cobrança por e-mail, com várias réguas por empresa.

-- Régua de cobrança por empresa, com várias réguas nomeadas e atribuição por cliente.
-- A chave da Resend fica cifrada. O envio automático bem-sucedido é único por fatura e passo.

CREATE TABLE "configuracoes_regua" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "modo_teste" BOOLEAN NOT NULL DEFAULT true,
    "remetente_nome" TEXT,
    "remetente_email" TEXT,
    "reply_to" TEXT,
    "chave_resend_cifrada" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_regua_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reguas_cobranca" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "hora_inicio" INTEGER NOT NULL DEFAULT 8,
    "hora_fim" INTEGER NOT NULL DEFAULT 18,
    "enviar_fim_de_semana" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reguas_cobranca_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "passos_regua" (
    "id" TEXT NOT NULL,
    "regua_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "na_emissao" BOOLEAN NOT NULL DEFAULT false,
    "dias" INTEGER,
    "canal" TEXT NOT NULL DEFAULT 'EMAIL',
    "assunto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "passos_regua_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lembretes_regua" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "fatura_id" TEXT NOT NULL,
    "passo_id" TEXT,
    "cliente_id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "motivo" TEXT,
    "destino" TEXT,
    "automatico" BOOLEAN NOT NULL,
    "modo_teste" BOOLEAN NOT NULL,
    "rotulo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lembretes_regua_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "clientes" ADD COLUMN "regua_id" TEXT,
ADD COLUMN "regua_modo" TEXT NOT NULL DEFAULT 'PADRAO',
ADD COLUMN "regua_pausada" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "configuracoes_regua_empresa_id_key" ON "configuracoes_regua"("empresa_id");

CREATE UNIQUE INDEX "reguas_cobranca_empresa_id_nome_key" ON "reguas_cobranca"("empresa_id", "nome");

CREATE INDEX "reguas_cobranca_empresa_id_idx" ON "reguas_cobranca"("empresa_id");

CREATE UNIQUE INDEX "reguas_cobranca_padrao_unico" ON "reguas_cobranca"("empresa_id") WHERE "padrao" = true;

CREATE INDEX "passos_regua_regua_id_ordem_idx" ON "passos_regua"("regua_id", "ordem");

CREATE INDEX "passos_regua_empresa_id_idx" ON "passos_regua"("empresa_id");

CREATE INDEX "lembretes_regua_fatura_id_criado_em_idx" ON "lembretes_regua"("fatura_id", "criado_em");

CREATE INDEX "lembretes_regua_empresa_id_idx" ON "lembretes_regua"("empresa_id");

CREATE UNIQUE INDEX "lembretes_regua_envio_unico" ON "lembretes_regua"("fatura_id", "passo_id") WHERE "automatico" = true AND "status" = 'ENVIADO' AND "passo_id" IS NOT NULL;

CREATE UNIQUE INDEX "lembretes_regua_ignorado_unico" ON "lembretes_regua"("fatura_id", "passo_id", "motivo") WHERE "automatico" = true AND "status" = 'IGNORADO' AND "passo_id" IS NOT NULL;

CREATE UNIQUE INDEX "lembretes_regua_ignorado_sem_passo" ON "lembretes_regua"("fatura_id", "motivo") WHERE "automatico" = true AND "status" = 'IGNORADO' AND "passo_id" IS NULL;

CREATE INDEX "clientes_regua_id_idx" ON "clientes"("regua_id");

ALTER TABLE "configuracoes_regua" ADD CONSTRAINT "configuracoes_regua_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reguas_cobranca" ADD CONSTRAINT "reguas_cobranca_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "passos_regua" ADD CONSTRAINT "passos_regua_regua_id_fkey" FOREIGN KEY ("regua_id") REFERENCES "reguas_cobranca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passos_regua" ADD CONSTRAINT "passos_regua_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lembretes_regua" ADD CONSTRAINT "lembretes_regua_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lembretes_regua" ADD CONSTRAINT "lembretes_regua_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lembretes_regua" ADD CONSTRAINT "lembretes_regua_passo_id_fkey" FOREIGN KEY ("passo_id") REFERENCES "passos_regua"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lembretes_regua" ADD CONSTRAINT "lembretes_regua_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_regua_id_fkey" FOREIGN KEY ("regua_id") REFERENCES "reguas_cobranca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reguas_cobranca" ADD CONSTRAINT "reguas_cobranca_nome_check" CHECK (char_length("nome") BETWEEN 1 AND 60);

ALTER TABLE "reguas_cobranca" ADD CONSTRAINT "reguas_cobranca_hora_check" CHECK ("hora_inicio" >= 0 AND "hora_inicio" <= 23 AND "hora_fim" >= 0 AND "hora_fim" <= 23 AND "hora_inicio" < "hora_fim");

ALTER TABLE "passos_regua" ADD CONSTRAINT "passos_regua_dia_check" CHECK (("na_emissao" = true AND "dias" IS NULL) OR ("na_emissao" = false AND "dias" BETWEEN -365 AND 365));

ALTER TABLE "passos_regua" ADD CONSTRAINT "passos_regua_canal_check" CHECK ("canal" = 'EMAIL');

ALTER TABLE "passos_regua" ADD CONSTRAINT "passos_regua_ordem_check" CHECK ("ordem" >= 0 AND "ordem" < 20);

ALTER TABLE "passos_regua" ADD CONSTRAINT "passos_regua_assunto_check" CHECK (char_length("assunto") BETWEEN 1 AND 200);

ALTER TABLE "passos_regua" ADD CONSTRAINT "passos_regua_corpo_check" CHECK (char_length("corpo") BETWEEN 1 AND 2000);

ALTER TABLE "lembretes_regua" ADD CONSTRAINT "lembretes_regua_status_check" CHECK ("status" IN ('ENVIADO', 'FALHOU', 'IGNORADO'));

ALTER TABLE "lembretes_regua" ADD CONSTRAINT "lembretes_regua_canal_check" CHECK ("canal" = 'EMAIL');

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_regua_modo_check" CHECK ("regua_modo" IN ('PADRAO', 'ESPECIFICA', 'NENHUMA'));

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_regua_atribuicao_check" CHECK (("regua_modo" = 'ESPECIFICA' AND "regua_id" IS NOT NULL) OR ("regua_modo" <> 'ESPECIFICA' AND "regua_id" IS NULL));

-- O passo, o lembrete e a régua do cliente precisam ser da mesma empresa.
-- Sem SECURITY DEFINER e sem GRANT: não é chamada pela API REST do Supabase.
CREATE FUNCTION "passos_regua_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "reguas_cobranca"
    WHERE "id" = NEW."regua_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'regua_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "passos_regua_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "passos_regua_mesma_empresa"
BEFORE INSERT OR UPDATE ON "passos_regua"
FOR EACH ROW
EXECUTE FUNCTION "passos_regua_mesma_empresa"();

CREATE FUNCTION "lembretes_regua_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "faturas"
    WHERE "id" = NEW."fatura_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'fatura_outra_empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "clientes"
    WHERE "id" = NEW."cliente_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'cliente_outra_empresa';
  END IF;

  IF NEW."passo_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "passos_regua"
    WHERE "id" = NEW."passo_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'passo_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "lembretes_regua_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "lembretes_regua_mesma_empresa"
BEFORE INSERT OR UPDATE ON "lembretes_regua"
FOR EACH ROW
EXECUTE FUNCTION "lembretes_regua_mesma_empresa"();

CREATE FUNCTION "clientes_regua_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."regua_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "reguas_cobranca"
    WHERE "id" = NEW."regua_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'regua_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "clientes_regua_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "clientes_regua_mesma_empresa"
BEFORE INSERT OR UPDATE ON "clientes"
FOR EACH ROW
EXECUTE FUNCTION "clientes_regua_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê estas tabelas.
ALTER TABLE "configuracoes_regua" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reguas_cobranca" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passos_regua" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lembretes_regua" ENABLE ROW LEVEL SECURITY;
