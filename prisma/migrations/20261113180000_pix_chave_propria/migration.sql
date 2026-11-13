-- Pix por chave própria.
-- APLICAR NO SUPABASE DE PRODUÇÃO ANTES DO MERGE.
-- Só acrescenta enum, tabelas, coluna e índices. Não remove nem renomeia nada.
-- O valor PIX_DIRETO não é usado nesta migration (o Postgres só libera
-- o valor novo depois do commit).

ALTER TYPE "provedor_pagamento" ADD VALUE IF NOT EXISTS 'PIX_DIRETO';

CREATE TYPE "tipo_chave_pix" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'EVP');

CREATE TYPE "origem_conciliacao" AS ENUM ('MANUAL', 'OPEN_FINANCE');

CREATE TABLE "configuracoes_pix_proprio" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "tipo_chave" "tipo_chave_pix" NOT NULL,
  "chave_pix" TEXT NOT NULL,
  "nome_recebedor" TEXT NOT NULL,
  "cidade_recebedor" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "configuracoes_pix_proprio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_pix_proprio_empresa_id_key"
  ON "configuracoes_pix_proprio"("empresa_id");

ALTER TABLE "configuracoes_pix_proprio"
  ADD CONSTRAINT "configuracoes_pix_proprio_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "conciliacoes_pagamento" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "fatura_id" TEXT NOT NULL,
  "origem" "origem_conciliacao" NOT NULL,
  "pago_em" DATE NOT NULL,
  "nota" TEXT,
  "usuario_id" TEXT,
  "referencia_externa" TEXT,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conciliacoes_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conciliacoes_pagamento_empresa_id_fatura_id_idx"
  ON "conciliacoes_pagamento"("empresa_id", "fatura_id");

CREATE INDEX "conciliacoes_pagamento_empresa_id_referencia_externa_idx"
  ON "conciliacoes_pagamento"("empresa_id", "referencia_externa");

CREATE UNIQUE INDEX "conciliacoes_pagamento_empresa_origem_ref_key"
  ON "conciliacoes_pagamento"("empresa_id", "origem", "referencia_externa")
  WHERE "referencia_externa" IS NOT NULL;

ALTER TABLE "conciliacoes_pagamento"
  ADD CONSTRAINT "conciliacoes_pagamento_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conciliacoes_pagamento"
  ADD CONSTRAINT "conciliacoes_pagamento_fatura_id_fkey"
  FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "faturas" ADD COLUMN "token_publico" TEXT;

CREATE UNIQUE INDEX "faturas_token_publico_key" ON "faturas"("token_publico");

ALTER TABLE "configuracoes_pix_proprio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conciliacoes_pagamento" ENABLE ROW LEVEL SECURITY;
