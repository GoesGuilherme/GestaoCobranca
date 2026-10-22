-- Espelho de prisma/migrations/20261021235900_multiempresa/migration.sql
-- Cria a assinante, liga usuários e clientes nela e liga o RLS nas tabelas novas.
-- O CNPJ 00000000000000 da Collab Software é placeholder e precisa ser editado.

-- CreateEnum
CREATE TYPE "status_empresa" AS ENUM ('ATIVA', 'SUSPENSA');

-- CreateEnum
CREATE TYPE "papel_usuario" AS ENUM ('DONO', 'FINANCEIRO', 'SUPORTE');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "email_contato" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "status" "status_empresa" NOT NULL DEFAULT 'ATIVA',
    "plano" TEXT NOT NULL DEFAULT 'basico',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

INSERT INTO "empresas" (
    "id",
    "razao_social",
    "nome_fantasia",
    "cnpj",
    "email_contato",
    "telefone",
    "status",
    "plano",
    "criado_em",
    "atualizado_em"
) VALUES (
    'collab_software',
    'Collab Software',
    'Collab Software',
    '00000000000000',
    'guilherme.goes@collabsoftware.com.br',
    '',
    'ATIVA',
    'basico',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "empresa_id" TEXT,
ADD COLUMN "papel" "papel_usuario" NOT NULL DEFAULT 'SUPORTE',
ADD COLUMN "superadministrador" BOOLEAN NOT NULL DEFAULT false;

UPDATE "usuarios"
SET "empresa_id" = 'collab_software',
    "papel" = 'DONO';

UPDATE "usuarios"
SET "superadministrador" = true,
    "papel" = 'DONO'
WHERE lower("email") = 'guilherme.goes@collabsoftware.com.br';

ALTER TABLE "usuarios" ALTER COLUMN "empresa_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "empresa_id" TEXT;

UPDATE "clientes" SET "empresa_id" = 'collab_software';

ALTER TABLE "clientes" ALTER COLUMN "empresa_id" SET NOT NULL;

-- DropIndex
DROP INDEX "clientes_documento_key";

-- CreateTable
CREATE TABLE "limites_cadastro" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "limites_cadastro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "limites_cadastro_chave_criado_em_idx" ON "limites_cadastro"("chave", "criado_em");

-- CreateIndex
CREATE INDEX "clientes_empresa_id_idx" ON "clientes"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_empresa_id_documento_key" ON "clientes"("empresa_id", "documento");

-- CreateIndex
CREATE INDEX "usuarios_empresa_id_idx" ON "usuarios"("empresa_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O app continua entrando como postgres, que ignora o RLS.
-- Sem política, a API REST pública do Supabase não lê estas tabelas.
ALTER TABLE "empresas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "limites_cadastro" ENABLE ROW LEVEL SECURITY;
