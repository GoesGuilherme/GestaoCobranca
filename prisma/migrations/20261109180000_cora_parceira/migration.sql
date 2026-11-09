-- Conector Cora (Parceria, Stage). Só adiciona coluna, tabela e índices.
-- Não remove, não renomeia e não altera índices já existentes.

ALTER TABLE "faturas"
  ADD COLUMN "idempotency_key_cora" TEXT;

CREATE UNIQUE INDEX "faturas_idempotency_key_cora_key"
  ON "faturas"("idempotency_key_cora");

CREATE INDEX "faturas_provedor_id_externo_idx"
  ON "faturas"("provedor", "id_externo");

CREATE TABLE "estados_oauth" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "usuario_id" TEXT NOT NULL,
  "provedor" "provedor_pagamento" NOT NULL,
  "estado_hash" TEXT NOT NULL,
  "expira_em" TIMESTAMPTZ(3) NOT NULL,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "estados_oauth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "estados_oauth_estado_hash_key" ON "estados_oauth"("estado_hash");
CREATE INDEX "estados_oauth_empresa_id_usuario_id_idx" ON "estados_oauth"("empresa_id", "usuario_id");

ALTER TABLE "estados_oauth"
  ADD CONSTRAINT "estados_oauth_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "estados_oauth"
  ADD CONSTRAINT "estados_oauth_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "estados_oauth" ENABLE ROW LEVEL SECURITY;
