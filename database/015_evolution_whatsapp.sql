-- Espelha prisma/migrations/20261105150000_evolution_whatsapp.
-- Não aplicar em produção por este arquivo. A fonte da verdade é o Prisma Migrate.

CREATE TABLE "configuracoes_canal_whatsapp" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "provedor" TEXT NOT NULL DEFAULT 'TWILIO',
    "instance_name" TEXT,
    "status_conexao" TEXT NOT NULL DEFAULT 'DESCONECTADO',
    "telefone" TEXT,
    "erro" TEXT,
    "ultimo_evento_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_canal_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alertas_empresa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "lido" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alertas_empresa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "limites_tentativa" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "limites_tentativa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracoes_canal_whatsapp_empresa_id_key" ON "configuracoes_canal_whatsapp"("empresa_id");
CREATE UNIQUE INDEX "configuracoes_canal_whatsapp_instance_name_key" ON "configuracoes_canal_whatsapp"("instance_name");
CREATE UNIQUE INDEX "alertas_empresa_empresa_id_codigo_key" ON "alertas_empresa"("empresa_id", "codigo");
CREATE INDEX "alertas_empresa_empresa_id_lido_idx" ON "alertas_empresa"("empresa_id", "lido");
CREATE INDEX "limites_tentativa_chave_criado_em_idx" ON "limites_tentativa"("chave", "criado_em");

ALTER TABLE "configuracoes_canal_whatsapp" ADD CONSTRAINT "configuracoes_canal_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alertas_empresa" ADD CONSTRAINT "alertas_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "configuracoes_canal_whatsapp" ADD CONSTRAINT "configuracoes_canal_whatsapp_provedor_check" CHECK ("provedor" IN ('TWILIO', 'EVOLUTION'));
ALTER TABLE "configuracoes_canal_whatsapp" ADD CONSTRAINT "configuracoes_canal_whatsapp_status_check" CHECK ("status_conexao" IN ('DESCONECTADO', 'CONECTANDO', 'CONECTADO', 'ERRO'));
ALTER TABLE "alertas_empresa" ADD CONSTRAINT "alertas_empresa_codigo_check" CHECK ("codigo" IN ('WHATSAPP_DESCONECTADO', 'WHATSAPP_FALHA_ENVIO'));

ALTER TABLE "configuracoes_canal_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alertas_empresa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "limites_tentativa" ENABLE ROW LEVEL SECURITY;
