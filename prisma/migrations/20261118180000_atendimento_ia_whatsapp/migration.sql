-- Atendimento por IA no WhatsApp. Só acrescenta tabelas, índices, função e gatilho.
-- Não apaga dado. ativo nasce desligado em toda empresa.
-- Sem política, a API REST do Supabase não lê estas tabelas.
-- O app entra como dono da tabela e ignora o RLS.

CREATE TABLE "configuracoes_atendimento_ia" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "instrucoes" TEXT,
    "texto_repasse" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_atendimento_ia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversas_atendimento_ia" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cliente_id" TEXT,
    "precisa_atencao" BOOLEAN NOT NULL DEFAULT false,
    "pausada_ate" TIMESTAMPTZ(3),
    "divulgou_assistente" BOOLEAN NOT NULL DEFAULT false,
    "motivo_atencao" TEXT,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversas_atendimento_ia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entradas_atendimento_ia" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "message_sid" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_atendimento_ia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_atendimento_ia_empresa_id_key" ON "configuracoes_atendimento_ia"("empresa_id");

CREATE UNIQUE INDEX "conversas_atendimento_ia_empresa_id_telefone_key" ON "conversas_atendimento_ia"("empresa_id", "telefone");
CREATE INDEX "conversas_atendimento_ia_empresa_id_precisa_atencao_idx" ON "conversas_atendimento_ia"("empresa_id", "precisa_atencao");
CREATE INDEX "conversas_atendimento_ia_cliente_id_idx" ON "conversas_atendimento_ia"("cliente_id");

CREATE UNIQUE INDEX "entradas_atendimento_ia_empresa_id_message_sid_key" ON "entradas_atendimento_ia"("empresa_id", "message_sid");
CREATE INDEX "entradas_atendimento_ia_empresa_id_idx" ON "entradas_atendimento_ia"("empresa_id");

ALTER TABLE "configuracoes_atendimento_ia" ADD CONSTRAINT "configuracoes_atendimento_ia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversas_atendimento_ia" ADD CONSTRAINT "conversas_atendimento_ia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversas_atendimento_ia" ADD CONSTRAINT "conversas_atendimento_ia_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "entradas_atendimento_ia" ADD CONSTRAINT "entradas_atendimento_ia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "configuracoes_atendimento_ia" ADD CONSTRAINT "configuracoes_atendimento_ia_instrucoes_check" CHECK ("instrucoes" IS NULL OR char_length("instrucoes") <= 1500);
ALTER TABLE "configuracoes_atendimento_ia" ADD CONSTRAINT "configuracoes_atendimento_ia_texto_repasse_check" CHECK ("texto_repasse" IS NULL OR char_length("texto_repasse") <= 500);

ALTER TABLE "conversas_atendimento_ia" ADD CONSTRAINT "conversas_atendimento_ia_telefone_check" CHECK ("telefone" ~ '^[0-9]{10,15}$');
ALTER TABLE "conversas_atendimento_ia" ADD CONSTRAINT "conversas_atendimento_ia_motivo_check" CHECK ("motivo_atencao" IS NULL OR char_length("motivo_atencao") <= 160);

ALTER TABLE "entradas_atendimento_ia" ADD CONSTRAINT "entradas_atendimento_ia_message_sid_check" CHECK (char_length("message_sid") BETWEEN 1 AND 64);

-- O cliente da conversa, quando existe, é da mesma empresa.
CREATE FUNCTION "conversas_atendimento_ia_mesma_empresa"()
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "conversas_atendimento_ia_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "conversas_atendimento_ia_mesma_empresa"
BEFORE INSERT OR UPDATE ON "conversas_atendimento_ia"
FOR EACH ROW
EXECUTE FUNCTION "conversas_atendimento_ia_mesma_empresa"();

ALTER TABLE "configuracoes_atendimento_ia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversas_atendimento_ia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entradas_atendimento_ia" ENABLE ROW LEVEL SECURITY;
