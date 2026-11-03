-- Promessa de pagamento por fatura, e o ajuste opcional do selo.
-- Só cria tipo, tabela, coluna, índices, chaves e gatilho.
-- Não remove nem recria índice existente.

CREATE TYPE "canal_promessa" AS ENUM ('WHATSAPP', 'TELEFONE', 'EMAIL', 'PRESENCIAL', 'OUTRO');

CREATE TYPE "status_promessa_pagamento" AS ENUM ('PENDENTE', 'CUMPRIDA', 'CUMPRIDA_COM_ATRASO', 'QUEBRADA', 'CANCELADA');

CREATE TABLE "promessas_pagamento" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "fatura_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "data_prometida" DATE NOT NULL,
    "valor_prometido" DECIMAL(12,2) NOT NULL,
    "canal" "canal_promessa" NOT NULL,
    "observacao" TEXT,
    "status" "status_promessa_pagamento" NOT NULL DEFAULT 'PENDENTE',
    "registrada_por_id" TEXT NOT NULL,
    "registrada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cumprida_em" DATE,
    "quebrada_em" DATE,
    "cancelada_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promessas_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "promessas_pagamento_empresa_id_idx" ON "promessas_pagamento"("empresa_id");

CREATE INDEX "promessas_pagamento_fatura_id_idx" ON "promessas_pagamento"("fatura_id");

CREATE INDEX "promessas_pagamento_status_idx" ON "promessas_pagamento"("status");

CREATE INDEX "promessas_pagamento_data_prometida_idx" ON "promessas_pagamento"("data_prometida");

CREATE INDEX "promessas_pagamento_empresa_id_status_data_prometida_idx" ON "promessas_pagamento"("empresa_id", "status", "data_prometida");

CREATE INDEX "promessas_pagamento_empresa_id_cliente_id_idx" ON "promessas_pagamento"("empresa_id", "cliente_id");

-- Uma promessa pendente por fatura. Cumprida, quebrada e cancelada podem repetir.
CREATE UNIQUE INDEX "promessas_pendente_por_fatura"
ON "promessas_pagamento"("fatura_id")
WHERE "status" = 'PENDENTE';

ALTER TABLE "promessas_pagamento" ADD CONSTRAINT "promessas_pagamento_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "promessas_pagamento" ADD CONSTRAINT "promessas_pagamento_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promessas_pagamento" ADD CONSTRAINT "promessas_pagamento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promessas_pagamento" ADD CONSTRAINT "promessas_pagamento_registrada_por_id_fkey" FOREIGN KEY ("registrada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "empresas" ADD COLUMN "promessas_contam_no_selo" BOOLEAN NOT NULL DEFAULT false;

-- Fatura, cliente e quem registrou têm de ser da mesma empresa.
-- Sem SECURITY DEFINER e sem GRANT: não é chamada pela API REST do Supabase.
CREATE FUNCTION "promessas_mesma_empresa"()
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

  IF NOT EXISTS (
    SELECT 1 FROM "usuarios"
    WHERE "id" = NEW."registrada_por_id" AND "empresa_id" = NEW."empresa_id"
  ) THEN
    RAISE EXCEPTION 'promessa_usuario_outra_empresa';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "promessas_mesma_empresa"() FROM PUBLIC;

CREATE TRIGGER "promessas_mesma_empresa"
BEFORE INSERT OR UPDATE ON "promessas_pagamento"
FOR EACH ROW
EXECUTE FUNCTION "promessas_mesma_empresa"();

-- O app entra como dono da tabela, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê esta tabela.
ALTER TABLE "promessas_pagamento" ENABLE ROW LEVEL SECURITY;
