-- CreateEnum
CREATE TYPE "recorrencia_servico" AS ENUM ('MENSAL', 'AVULSO');

-- CreateEnum
CREATE TYPE "status_servico_cliente" AS ENUM ('ATIVO', 'INATIVO');

-- CreateTable
CREATE TABLE "servicos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "preco_padrao" DECIMAL(12,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes_servicos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "servico_id" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "recorrencia" "recorrencia_servico" NOT NULL,
    "inicio_em" DATE NOT NULL,
    "status" "status_servico_cliente" NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clientes_servicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "servicos_empresa_id_idx" ON "servicos"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "servicos_empresa_id_nome_key" ON "servicos"("empresa_id", "nome");

-- CreateIndex
CREATE INDEX "clientes_servicos_empresa_id_idx" ON "clientes_servicos"("empresa_id");

-- CreateIndex
CREATE INDEX "clientes_servicos_cliente_id_idx" ON "clientes_servicos"("cliente_id");

-- CreateIndex
CREATE INDEX "clientes_servicos_servico_id_idx" ON "clientes_servicos"("servico_id");

-- CreateIndex
CREATE INDEX "clientes_servicos_empresa_id_status_recorrencia_idx" ON "clientes_servicos"("empresa_id", "status", "recorrencia");

-- AddForeignKey
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O preço e o valor combinado são reais, nunca negativos.
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_preco_padrao_check" CHECK ("preco_padrao" >= 0);
ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_valor_check" CHECK ("valor" >= 0);

-- O nome do serviço não se repete na mesma empresa, ignorando maiúsculas.
CREATE UNIQUE INDEX "servicos_empresa_id_nome_lower_key" ON "servicos" ("empresa_id", lower("nome"));

-- Garante que cliente e serviço do vínculo são da mesma empresa gravada na linha.
-- Sem SECURITY DEFINER e sem GRANT: não é chamada pela API REST do Supabase.
CREATE FUNCTION "clientes_servicos_mesma_empresa"()
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

  IF NOT EXISTS (
    SELECT 1 FROM "servicos"
    WHERE "id" = NEW."servico_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'servico_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "clientes_servicos_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "clientes_servicos_mesma_empresa"
BEFORE INSERT OR UPDATE ON "clientes_servicos"
FOR EACH ROW
EXECUTE FUNCTION "clientes_servicos_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê estas tabelas.
ALTER TABLE "servicos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clientes_servicos" ENABLE ROW LEVEL SECURITY;
