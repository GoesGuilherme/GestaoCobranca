-- WhatsApp da régua via Twilio (subconta, Sender, templates UTILITY, fila e opt-out).
-- Só acrescenta tabela, coluna, índice, função e RLS.
-- Não altera faturas nem o índice parcial faturas_criando_por_cliente.

ALTER TABLE "passos_regua" ADD COLUMN "enviar_whatsapp" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "configuracoes_twilio" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "subaccount_sid" TEXT NOT NULL,
    "auth_token_cifrado" TEXT NOT NULL,
    "auth_token_ultimos4" TEXT NOT NULL,
    "sender_sid" TEXT,
    "sender_telefone" TEXT,
    "sender_status" TEXT NOT NULL DEFAULT 'AUSENTE',
    "waba_id" TEXT,
    "nome_exibicao" TEXT NOT NULL,
    "coexistencia" TEXT NOT NULL DEFAULT 'NAO_SOLICITADA',
    "webhook_url" TEXT NOT NULL,
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_twilio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "templates_whatsapp" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "content_sid" TEXT,
    "nome" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt_BR',
    "categoria" TEXT NOT NULL DEFAULT 'UTILITY',
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "corpo" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "templates_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fila_whatsapp" (
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
    "variaveis" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fila_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eventos_whatsapp" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "fila_id" TEXT,
    "message_sid" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "corpo" TEXT,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "optouts_whatsapp" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "origem" TEXT NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optouts_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_twilio_empresa_id_key" ON "configuracoes_twilio"("empresa_id");
CREATE UNIQUE INDEX "configuracoes_twilio_subaccount_sid_key" ON "configuracoes_twilio"("subaccount_sid");

CREATE UNIQUE INDEX "templates_whatsapp_empresa_id_tipo_key" ON "templates_whatsapp"("empresa_id", "tipo");
CREATE INDEX "templates_whatsapp_empresa_id_idx" ON "templates_whatsapp"("empresa_id");

CREATE UNIQUE INDEX "fila_whatsapp_chave_idempotencia_key" ON "fila_whatsapp"("chave_idempotencia");
CREATE INDEX "fila_whatsapp_status_disponivel_em_idx" ON "fila_whatsapp"("status", "disponivel_em");
CREATE INDEX "fila_whatsapp_fatura_id_criado_em_idx" ON "fila_whatsapp"("fatura_id", "criado_em");
CREATE INDEX "fila_whatsapp_empresa_id_idx" ON "fila_whatsapp"("empresa_id");
CREATE INDEX "fila_whatsapp_message_sid_idx" ON "fila_whatsapp"("message_sid");

CREATE UNIQUE INDEX "eventos_whatsapp_empresa_id_message_sid_tipo_status_key" ON "eventos_whatsapp"("empresa_id", "message_sid", "tipo", "status");
CREATE INDEX "eventos_whatsapp_empresa_id_idx" ON "eventos_whatsapp"("empresa_id");
CREATE INDEX "eventos_whatsapp_fila_id_idx" ON "eventos_whatsapp"("fila_id");

CREATE UNIQUE INDEX "optouts_whatsapp_empresa_id_telefone_key" ON "optouts_whatsapp"("empresa_id", "telefone");
CREATE INDEX "optouts_whatsapp_empresa_id_idx" ON "optouts_whatsapp"("empresa_id");

ALTER TABLE "configuracoes_twilio" ADD CONSTRAINT "configuracoes_twilio_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "templates_whatsapp" ADD CONSTRAINT "templates_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fila_whatsapp" ADD CONSTRAINT "fila_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fila_whatsapp" ADD CONSTRAINT "fila_whatsapp_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fila_whatsapp" ADD CONSTRAINT "fila_whatsapp_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fila_whatsapp" ADD CONSTRAINT "fila_whatsapp_passo_id_fkey" FOREIGN KEY ("passo_id") REFERENCES "passos_regua"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "eventos_whatsapp" ADD CONSTRAINT "eventos_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eventos_whatsapp" ADD CONSTRAINT "eventos_whatsapp_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "fila_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "optouts_whatsapp" ADD CONSTRAINT "optouts_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "configuracoes_twilio" ADD CONSTRAINT "configuracoes_twilio_coexistencia_check" CHECK ("coexistencia" IN ('NAO_SOLICITADA', 'SOLICITADA', 'ATIVA', 'INDISPONIVEL'));
ALTER TABLE "templates_whatsapp" ADD CONSTRAINT "templates_whatsapp_tipo_check" CHECK ("tipo" IN ('BOLETO_GERADO', 'VENCE_EM_DIAS', 'VENCEU', 'PAGO'));
ALTER TABLE "templates_whatsapp" ADD CONSTRAINT "templates_whatsapp_categoria_check" CHECK ("categoria" = 'UTILITY');
ALTER TABLE "templates_whatsapp" ADD CONSTRAINT "templates_whatsapp_status_check" CHECK ("status" IN ('RASCUNHO', 'ENVIADO_APROVACAO', 'APROVADO', 'REJEITADO', 'FALHOU'));
ALTER TABLE "fila_whatsapp" ADD CONSTRAINT "fila_whatsapp_status_check" CHECK ("status" IN ('PENDENTE', 'PROCESSANDO', 'ENVIADO', 'FALHOU', 'IGNORADO'));
ALTER TABLE "fila_whatsapp" ADD CONSTRAINT "fila_whatsapp_tipo_check" CHECK ("tipo" IN ('BOLETO_GERADO', 'VENCE_EM_DIAS', 'VENCEU', 'PAGO'));
ALTER TABLE "eventos_whatsapp" ADD CONSTRAINT "eventos_whatsapp_tipo_check" CHECK ("tipo" IN ('STATUS', 'INBOUND'));
ALTER TABLE "optouts_whatsapp" ADD CONSTRAINT "optouts_whatsapp_telefone_check" CHECK (char_length("telefone") BETWEEN 10 AND 15);

-- A fila precisa ser da mesma empresa da fatura, do cliente e do passo.
CREATE FUNCTION "fila_whatsapp_mesma_empresa"()
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

REVOKE ALL ON FUNCTION "fila_whatsapp_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "fila_whatsapp_mesma_empresa"
BEFORE INSERT OR UPDATE ON "fila_whatsapp"
FOR EACH ROW
EXECUTE FUNCTION "fila_whatsapp_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê estas tabelas.
ALTER TABLE "configuracoes_twilio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "templates_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fila_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "optouts_whatsapp" ENABLE ROW LEVEL SECURITY;
