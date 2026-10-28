-- Espelha prisma/migrations/20261028150000_redefinicao_senha.
-- Não aplicar em produção por este arquivo. A fonte da verdade é o Prisma Migrate.

ALTER TABLE "usuarios" ADD COLUMN "versao_sessao" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "redefinicoes_senha" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "usado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redefinicoes_senha_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "redefinicoes_senha_token_hash_key" ON "redefinicoes_senha"("token_hash");
CREATE INDEX "redefinicoes_senha_usuario_id_idx" ON "redefinicoes_senha"("usuario_id");

ALTER TABLE "redefinicoes_senha" ADD CONSTRAINT "redefinicoes_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "redefinicoes_senha" ENABLE ROW LEVEL SECURITY;
