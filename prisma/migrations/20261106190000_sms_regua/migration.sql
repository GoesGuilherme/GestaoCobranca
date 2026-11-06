-- SMS da régua, na mesma conta Twilio do WhatsApp, pela API Messages.
-- Só acrescenta coluna, tabela, índice, função e RLS.
-- Não altera faturas nem o índice parcial faturas_criando_por_cliente.

ALTER TABLE "passos_regua" ADD COLUMN "enviar_sms" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "fila_sms" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "fatura_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "passo_id" TEXT,
    "tipo" TEXT NOT NULL,
    "chave_idempotencia" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "destino" TEXT,
    "message_sid" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "disponivel_em" TIMESTAMPTZ(3) NOT NULL,
    "motivo" TEXT,
    "modo_teste" BOOLEAN NOT NULL,
    "rotulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL DEFAULT '',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fila_sms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fila_sms_chave_idempotencia_key" ON "fila_sms"("chave_idempotencia");
CREATE INDEX "fila_sms_status_disponivel_em_idx" ON "fila_sms"("status", "disponivel_em");
CREATE INDEX "fila_sms_fatura_id_criado_em_idx" ON "fila_sms"("fatura_id", "criado_em");
CREATE INDEX "fila_sms_empresa_id_idx" ON "fila_sms"("empresa_id");
CREATE INDEX "fila_sms_message_sid_idx" ON "fila_sms"("message_sid");

ALTER TABLE "fila_sms" ADD CONSTRAINT "fila_sms_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fila_sms" ADD CONSTRAINT "fila_sms_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fila_sms" ADD CONSTRAINT "fila_sms_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fila_sms" ADD CONSTRAINT "fila_sms_passo_id_fkey" FOREIGN KEY ("passo_id") REFERENCES "passos_regua"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fila_sms" ADD CONSTRAINT "fila_sms_status_check" CHECK ("status" IN ('PENDENTE', 'PROCESSANDO', 'ENVIADO', 'FALHOU', 'IGNORADO'));
ALTER TABLE "fila_sms" ADD CONSTRAINT "fila_sms_tipo_check" CHECK ("tipo" IN ('BOLETO_GERADO', 'VENCE_EM_DIAS', 'VENCEU', 'PAGO'));

-- A fila precisa ser da mesma empresa da fatura, do cliente e do passo.
CREATE FUNCTION "fila_sms_mesma_empresa"()
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

REVOKE ALL ON FUNCTION "fila_sms_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "fila_sms_mesma_empresa"
BEFORE INSERT OR UPDATE ON "fila_sms"
FOR EACH ROW
EXECUTE FUNCTION "fila_sms_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê esta tabela.
ALTER TABLE "fila_sms" ENABLE ROW LEVEL SECURITY;
