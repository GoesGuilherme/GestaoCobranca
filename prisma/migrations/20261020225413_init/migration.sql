-- CreateEnum
CREATE TYPE "segmento" AS ENUM ('RESTAURANTE', 'MERCADO_AUTONOMO', 'OUTRO');

-- CreateEnum
CREATE TYPE "status_cliente" AS ENUM ('ATIVO', 'INATIVO', 'EM_IMPLANTACAO');

-- CreateEnum
CREATE TYPE "status_filial" AS ENUM ('ATIVA', 'INATIVA', 'EM_IMPLANTACAO');

-- CreateEnum
CREATE TYPE "tipo_documento" AS ENUM ('CPF', 'CNPJ');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nome_fantasia" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "tipo_documento" "tipo_documento" NOT NULL,
    "segmento" "segmento" NOT NULL,
    "contato_nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "status" "status_cliente" NOT NULL,
    "observacoes" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filiais" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "status" "status_filial" NOT NULL,
    "observacoes" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "filiais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_documento_key" ON "clientes"("documento");

-- CreateIndex
CREATE INDEX "clientes_nome_fantasia_idx" ON "clientes"("nome_fantasia");

-- CreateIndex
CREATE INDEX "clientes_cidade_idx" ON "clientes"("cidade");

-- CreateIndex
CREATE INDEX "clientes_status_idx" ON "clientes"("status");

-- CreateIndex
CREATE INDEX "clientes_segmento_idx" ON "clientes"("segmento");

-- CreateIndex
CREATE INDEX "filiais_cliente_id_idx" ON "filiais"("cliente_id");

-- CreateIndex
CREATE INDEX "filiais_nome_idx" ON "filiais"("nome");

-- AddForeignKey
ALTER TABLE "filiais" ADD CONSTRAINT "filiais_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
