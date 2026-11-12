-- Leitura da conversa e texto livre enviado pelo usuário da empresa.
-- Não altera a fila da régua nem os eventos que o webhook já grava.
-- Sem política, a API REST do Supabase não lê estas tabelas.
-- O app entra como dono da tabela e ignora o RLS.
-- Este arquivo não envia mensagem e não altera webhook na Twilio.

CREATE TABLE "leituras_whatsapp" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "lido_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leituras_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "respostas_whatsapp" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cliente_id" TEXT,
    "usuario_id" TEXT,
    "corpo" TEXT NOT NULL,
    "message_sid" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respostas_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leituras_whatsapp_empresa_id_telefone_key" ON "leituras_whatsapp"("empresa_id", "telefone");
CREATE INDEX "leituras_whatsapp_empresa_id_idx" ON "leituras_whatsapp"("empresa_id");

CREATE UNIQUE INDEX "respostas_whatsapp_message_sid_key" ON "respostas_whatsapp"("message_sid");
CREATE INDEX "respostas_whatsapp_empresa_id_telefone_criado_em_idx" ON "respostas_whatsapp"("empresa_id", "telefone", "criado_em");
CREATE INDEX "respostas_whatsapp_empresa_id_idx" ON "respostas_whatsapp"("empresa_id");

ALTER TABLE "leituras_whatsapp" ADD CONSTRAINT "leituras_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "respostas_whatsapp" ADD CONSTRAINT "respostas_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "respostas_whatsapp" ADD CONSTRAINT "respostas_whatsapp_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "respostas_whatsapp" ADD CONSTRAINT "respostas_whatsapp_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leituras_whatsapp" ADD CONSTRAINT "leituras_whatsapp_telefone_check" CHECK ("telefone" ~ '^[0-9]{10,15}$');
ALTER TABLE "respostas_whatsapp" ADD CONSTRAINT "respostas_whatsapp_telefone_check" CHECK ("telefone" ~ '^[0-9]{10,15}$');
ALTER TABLE "respostas_whatsapp" ADD CONSTRAINT "respostas_whatsapp_corpo_check" CHECK (char_length("corpo") BETWEEN 1 AND 1000);

-- A resposta precisa ser da mesma empresa do cliente e do usuário, quando existirem.
CREATE FUNCTION "respostas_whatsapp_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."cliente_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "clientes"
    WHERE "id" = NEW."cliente_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'cliente_outra_empresa';
  END IF;

  IF NEW."usuario_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "usuarios"
    WHERE "id" = NEW."usuario_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'usuario_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "respostas_whatsapp_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "respostas_whatsapp_mesma_empresa"
BEFORE INSERT OR UPDATE ON "respostas_whatsapp"
FOR EACH ROW
EXECUTE FUNCTION "respostas_whatsapp_mesma_empresa"();

ALTER TABLE "leituras_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "respostas_whatsapp" ENABLE ROW LEVEL SECURITY;
