-- Assessor de cobrança no WhatsApp de cada empresa.
-- Só acrescenta tabela, coluna, índice, função e RLS.
-- Não altera a tabela faturas nem índices já existentes.

ALTER TABLE "filiais" ADD COLUMN "whatsapp" TEXT;

CREATE TABLE "configuracoes_assessor" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "modo_teste" BOOLEAN NOT NULL DEFAULT true,
    "nome" TEXT NOT NULL DEFAULT 'Assessor',
    "tom" TEXT NOT NULL DEFAULT 'cordial, claro e breve',
    "prompt_extra" TEXT,
    "hora_inicio" INTEGER NOT NULL DEFAULT 8,
    "hora_fim" INTEGER NOT NULL DEFAULT 18,
    "atende_fim_de_semana" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_assessor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversas_assessor" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "cliente_id" TEXT,
    "ia_pausada" BOOLEAN NOT NULL DEFAULT false,
    "aguardando_documento" BOOLEAN NOT NULL DEFAULT false,
    "janela_ate" TIMESTAMPTZ(3) NOT NULL,
    "ultima_entrada_em" TIMESTAMPTZ(3) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversas_assessor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mensagens_assessor" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "conversa_id" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "message_sid" TEXT,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_assessor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pedidos_atendimento" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "conversa_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "motivo" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pedidos_atendimento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "limites_assessor" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "janela_inicio" TIMESTAMPTZ(3) NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "limites_assessor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_assessor_empresa_id_key" ON "configuracoes_assessor"("empresa_id");

CREATE UNIQUE INDEX "conversas_assessor_empresa_id_telefone_key" ON "conversas_assessor"("empresa_id", "telefone");
CREATE INDEX "conversas_assessor_empresa_id_atualizado_em_idx" ON "conversas_assessor"("empresa_id", "atualizado_em");
CREATE INDEX "conversas_assessor_cliente_id_idx" ON "conversas_assessor"("cliente_id");

CREATE UNIQUE INDEX "mensagens_assessor_empresa_id_message_sid_key" ON "mensagens_assessor"("empresa_id", "message_sid");
CREATE INDEX "mensagens_assessor_conversa_id_criado_em_idx" ON "mensagens_assessor"("conversa_id", "criado_em");
CREATE INDEX "mensagens_assessor_empresa_id_criado_em_idx" ON "mensagens_assessor"("empresa_id", "criado_em");

CREATE INDEX "pedidos_atendimento_empresa_id_status_idx" ON "pedidos_atendimento"("empresa_id", "status");
CREATE INDEX "pedidos_atendimento_conversa_id_idx" ON "pedidos_atendimento"("conversa_id");

CREATE UNIQUE INDEX "limites_assessor_empresa_id_chave_janela_inicio_key" ON "limites_assessor"("empresa_id", "chave", "janela_inicio");
CREATE INDEX "limites_assessor_empresa_id_idx" ON "limites_assessor"("empresa_id");

CREATE INDEX "filiais_whatsapp_idx" ON "filiais"("whatsapp");

ALTER TABLE "configuracoes_assessor" ADD CONSTRAINT "configuracoes_assessor_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversas_assessor" ADD CONSTRAINT "conversas_assessor_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversas_assessor" ADD CONSTRAINT "conversas_assessor_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mensagens_assessor" ADD CONSTRAINT "mensagens_assessor_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mensagens_assessor" ADD CONSTRAINT "mensagens_assessor_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas_assessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pedidos_atendimento" ADD CONSTRAINT "pedidos_atendimento_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos_atendimento" ADD CONSTRAINT "pedidos_atendimento_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas_assessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pedidos_atendimento" ADD CONSTRAINT "pedidos_atendimento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "limites_assessor" ADD CONSTRAINT "limites_assessor_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "filiais" ADD CONSTRAINT "filiais_whatsapp_check" CHECK ("whatsapp" IS NULL OR char_length("whatsapp") BETWEEN 10 AND 15);
ALTER TABLE "configuracoes_assessor" ADD CONSTRAINT "configuracoes_assessor_horario_check" CHECK ("hora_inicio" >= 0 AND "hora_inicio" <= 23 AND "hora_fim" >= 0 AND "hora_fim" <= 23 AND "hora_inicio" < "hora_fim");
ALTER TABLE "configuracoes_assessor" ADD CONSTRAINT "configuracoes_assessor_nome_check" CHECK (char_length("nome") BETWEEN 2 AND 40);
ALTER TABLE "conversas_assessor" ADD CONSTRAINT "conversas_assessor_telefone_check" CHECK (char_length("telefone") BETWEEN 12 AND 15);
ALTER TABLE "mensagens_assessor" ADD CONSTRAINT "mensagens_assessor_papel_check" CHECK ("papel" IN ('CLIENTE', 'ASSESSOR', 'HUMANO', 'SISTEMA'));
ALTER TABLE "pedidos_atendimento" ADD CONSTRAINT "pedidos_atendimento_motivo_check" CHECK ("motivo" IN ('TECNICO', 'PEDIDO', 'FORA_ESCOPO'));
ALTER TABLE "pedidos_atendimento" ADD CONSTRAINT "pedidos_atendimento_status_check" CHECK ("status" IN ('ABERTO', 'ASSUMIDO', 'ENCERRADO'));
ALTER TABLE "limites_assessor" ADD CONSTRAINT "limites_assessor_chave_check" CHECK (char_length("chave") BETWEEN 3 AND 40);

-- A conversa, a mensagem e o pedido precisam ser da mesma empresa do cliente.
CREATE FUNCTION "assessor_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'conversas_assessor' THEN
    IF NEW."cliente_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "clientes" WHERE "id" = NEW."cliente_id" AND "empresa_id" = NEW."empresa_id"
    ) THEN
      RAISE EXCEPTION 'cliente_outra_empresa';
    END IF;
  ELSIF TG_TABLE_NAME = 'mensagens_assessor' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "conversas_assessor" WHERE "id" = NEW."conversa_id" AND "empresa_id" = NEW."empresa_id"
    ) THEN
      RAISE EXCEPTION 'conversa_outra_empresa';
    END IF;
  ELSIF TG_TABLE_NAME = 'pedidos_atendimento' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "conversas_assessor" WHERE "id" = NEW."conversa_id" AND "empresa_id" = NEW."empresa_id"
    ) THEN
      RAISE EXCEPTION 'conversa_outra_empresa';
    END IF;
    IF NEW."cliente_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "clientes" WHERE "id" = NEW."cliente_id" AND "empresa_id" = NEW."empresa_id"
    ) THEN
      RAISE EXCEPTION 'cliente_outra_empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "assessor_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "conversas_assessor_mesma_empresa"
BEFORE INSERT OR UPDATE ON "conversas_assessor"
FOR EACH ROW
EXECUTE FUNCTION "assessor_mesma_empresa"();

CREATE TRIGGER "mensagens_assessor_mesma_empresa"
BEFORE INSERT OR UPDATE ON "mensagens_assessor"
FOR EACH ROW
EXECUTE FUNCTION "assessor_mesma_empresa"();

CREATE TRIGGER "pedidos_atendimento_mesma_empresa"
BEFORE INSERT OR UPDATE ON "pedidos_atendimento"
FOR EACH ROW
EXECUTE FUNCTION "assessor_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê estas tabelas.
ALTER TABLE "configuracoes_assessor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversas_assessor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mensagens_assessor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pedidos_atendimento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "limites_assessor" ENABLE ROW LEVEL SECURITY;
