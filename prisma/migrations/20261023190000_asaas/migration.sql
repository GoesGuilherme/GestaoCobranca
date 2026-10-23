-- CreateEnum
CREATE TYPE "ambiente_asaas" AS ENUM ('SANDBOX', 'PRODUCAO');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "asaas_customer_id" TEXT;

-- CreateTable
CREATE TABLE "configuracoes_asaas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ambiente" "ambiente_asaas" NOT NULL,
    "chave_api_cifrada" TEXT NOT NULL,
    "chave_api_ultimos4" TEXT NOT NULL,
    "token_webhook_cifrado" TEXT NOT NULL,
    "token_webhook_hash" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_asaas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faturas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "cliente_servico_id" TEXT,
    "asaas_payment_id" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "forma_cobranca" TEXT NOT NULL,
    "boleto_url" TEXT,
    "linha_digitavel" TEXT,
    "pix_copia_cola" TEXT,
    "fatura_url" TEXT,
    "descricao" TEXT,
    "excluida" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "faturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_asaas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "asaas_event_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_asaas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientes_asaas_customer_id_idx" ON "clientes"("asaas_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_asaas_empresa_id_key" ON "configuracoes_asaas"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_asaas_token_webhook_hash_key" ON "configuracoes_asaas"("token_webhook_hash");

-- CreateIndex
CREATE INDEX "faturas_empresa_id_excluida_status_idx" ON "faturas"("empresa_id", "excluida", "status");

-- CreateIndex
CREATE INDEX "faturas_cliente_id_idx" ON "faturas"("cliente_id");

-- CreateIndex
CREATE INDEX "faturas_cliente_servico_id_idx" ON "faturas"("cliente_servico_id");

-- CreateIndex
CREATE UNIQUE INDEX "faturas_empresa_id_asaas_payment_id_key" ON "faturas"("empresa_id", "asaas_payment_id");

-- CreateIndex
CREATE INDEX "eventos_asaas_empresa_id_idx" ON "eventos_asaas"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_asaas_empresa_id_asaas_event_id_key" ON "eventos_asaas"("empresa_id", "asaas_event_id");

-- AddForeignKey
ALTER TABLE "configuracoes_asaas" ADD CONSTRAINT "configuracoes_asaas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_cliente_servico_id_fkey" FOREIGN KEY ("cliente_servico_id") REFERENCES "clientes_servicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_asaas" ADD CONSTRAINT "eventos_asaas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O valor da fatura não pode ser negativo.
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_valor_check" CHECK ("valor" >= 0);

-- Cliente e, quando houver, o serviço vendido precisam ser da mesma empresa da fatura.
-- Sem SECURITY DEFINER e sem GRANT: não é chamada pela API REST do Supabase.
CREATE FUNCTION "faturas_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "clientes"
    WHERE "id" = NEW."cliente_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'cliente_outra_empresa';
  END IF;

  IF NEW."cliente_servico_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "clientes_servicos"
    WHERE "id" = NEW."cliente_servico_id" AND "empresa_id" = NEW."empresa_id" AND "cliente_id" = NEW."cliente_id"
  ) THEN
    RAISE EXCEPTION 'servico_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "faturas_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "faturas_mesma_empresa"
BEFORE INSERT OR UPDATE ON "faturas"
FOR EACH ROW
EXECUTE FUNCTION "faturas_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê estas tabelas.
ALTER TABLE "configuracoes_asaas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "faturas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_asaas" ENABLE ROW LEVEL SECURITY;
