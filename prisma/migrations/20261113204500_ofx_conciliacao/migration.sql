-- Conciliação do extrato OFX com cobranças Pix da própria empresa.
-- APLICAR NO SUPABASE DE PRODUÇÃO ANTES DO MERGE.
-- Só acrescenta enum, tabelas e índices. Não remove nem renomeia nada.
-- O valor OFX não é usado nesta migration (o Postgres só libera
-- o valor novo depois do commit).
-- Sem política, a API REST do Supabase não lê estas tabelas.
-- O app entra como dono da tabela e ignora o RLS.

ALTER TYPE "origem_conciliacao" ADD VALUE IF NOT EXISTS 'OFX';

CREATE TYPE "situacao_transacao_ofx" AS ENUM ('BAIXADA', 'SUGESTAO', 'NAO_IDENTIFICADA', 'IGNORADA');

CREATE TABLE "importacoes_ofx" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "usuario_id" TEXT,
  "nome_arquivo" TEXT NOT NULL,
  "bank_id" TEXT NOT NULL,
  "acct_id" TEXT NOT NULL,
  "moeda" TEXT NOT NULL DEFAULT 'BRL',
  "baixadas" INTEGER NOT NULL DEFAULT 0,
  "sugestoes" INTEGER NOT NULL DEFAULT 0,
  "nao_identificadas" INTEGER NOT NULL DEFAULT 0,
  "ja_importadas" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "importacoes_ofx_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "importacoes_ofx_empresa_id_criado_em_idx"
  ON "importacoes_ofx"("empresa_id", "criado_em");

ALTER TABLE "importacoes_ofx"
  ADD CONSTRAINT "importacoes_ofx_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "transacoes_ofx" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "importacao_id" TEXT NOT NULL,
  "bank_id" TEXT NOT NULL,
  "acct_id" TEXT NOT NULL,
  "fit_id" TEXT NOT NULL,
  "valor" DECIMAL(12, 2) NOT NULL,
  "data_credito" DATE NOT NULL,
  "memo" TEXT,
  "nome" TEXT,
  "situacao" "situacao_transacao_ofx" NOT NULL,
  "fatura_id" TEXT,
  "candidatas" JSONB NOT NULL DEFAULT '[]',
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "transacoes_ofx_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transacoes_ofx_empresa_id_bank_id_acct_id_fit_id_key"
  ON "transacoes_ofx"("empresa_id", "bank_id", "acct_id", "fit_id");

CREATE INDEX "transacoes_ofx_empresa_id_situacao_idx"
  ON "transacoes_ofx"("empresa_id", "situacao");

CREATE INDEX "transacoes_ofx_importacao_id_idx"
  ON "transacoes_ofx"("importacao_id");

ALTER TABLE "transacoes_ofx"
  ADD CONSTRAINT "transacoes_ofx_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transacoes_ofx"
  ADD CONSTRAINT "transacoes_ofx_importacao_id_fkey"
  FOREIGN KEY ("importacao_id") REFERENCES "importacoes_ofx"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transacoes_ofx"
  ADD CONSTRAINT "transacoes_ofx_fatura_id_fkey"
  FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "importacoes_ofx" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transacoes_ofx" ENABLE ROW LEVEL SECURITY;
