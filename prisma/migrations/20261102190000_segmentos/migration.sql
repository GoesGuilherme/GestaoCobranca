-- Cadastro de segmentos por empresa. Só cria tabela, coluna, índices,
-- chave estrangeira, função e gatilho. Não altera índice existente.

CREATE TABLE "segmentos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "segmentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "segmentos_empresa_id_idx" ON "segmentos"("empresa_id");

CREATE UNIQUE INDEX "segmentos_empresa_id_nome_key" ON "segmentos"("empresa_id", "nome");

-- O nome não se repete na mesma empresa, ignorando maiúsculas.
CREATE UNIQUE INDEX "segmentos_empresa_id_nome_lower_key" ON "segmentos" ("empresa_id", lower("nome"));

ALTER TABLE "segmentos" ADD CONSTRAINT "segmentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clientes" ADD COLUMN "segmento_id" TEXT;

CREATE INDEX "clientes_segmento_id_idx" ON "clientes"("segmento_id");

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_segmento_id_fkey" FOREIGN KEY ("segmento_id") REFERENCES "segmentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O segmento escolhido no cliente tem de ser da mesma empresa.
-- Sem SECURITY DEFINER e sem GRANT: não é chamada pela API REST do Supabase.
CREATE FUNCTION "clientes_segmento_mesma_empresa"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."segmento_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "segmentos"
    WHERE "id" = NEW."segmento_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'segmento_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "clientes_segmento_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "clientes_segmento_mesma_empresa"
BEFORE INSERT OR UPDATE ON "clientes"
FOR EACH ROW
EXECUTE FUNCTION "clientes_segmento_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê esta tabela.
ALTER TABLE "segmentos" ENABLE ROW LEVEL SECURITY;
