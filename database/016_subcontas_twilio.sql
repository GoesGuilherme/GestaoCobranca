-- Espelha prisma/migrations/20261111233000_subcontas_twilio.
-- Não aplicar em produção por este arquivo. A fonte da verdade é o Prisma Migrate.
-- Este arquivo não cria subconta, não compra número e não registra sender.

-- Subconta Twilio e números da empresa, para uso futuro.
-- A credencial fica cifrada com ASAAS_ENCRYPTION_KEY, o mesmo padrão de configuracoes_twilio.
-- Sem linha em subcontas_twilio, o envio continua na conta global.
-- Sem política, a API REST do Supabase não lê a credencial nem os números.
-- O app entra como dono da tabela e ignora o RLS.

CREATE TABLE "subcontas_twilio" (
    "empresa_id" TEXT NOT NULL,
    "subaccount_sid" TEXT NOT NULL,
    "credencial_cifrada" TEXT NOT NULL,
    "credencial_ultimos4" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIGURADA',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subcontas_twilio_pkey" PRIMARY KEY ("empresa_id")
);

CREATE TABLE "numeros_twilio_empresa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "telefone_e164" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CADASTRADO',
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "numeros_twilio_empresa_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subcontas_twilio" ADD CONSTRAINT "subcontas_twilio_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "numeros_twilio_empresa" ADD CONSTRAINT "numeros_twilio_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subcontas_twilio" ADD CONSTRAINT "subcontas_twilio_sid_key" UNIQUE ("subaccount_sid");

ALTER TABLE "subcontas_twilio" ADD CONSTRAINT "subcontas_twilio_sid_check" CHECK ("subaccount_sid" ~ '^AC[0-9a-fA-F]{32}$');

ALTER TABLE "subcontas_twilio" ADD CONSTRAINT "subcontas_twilio_status_check" CHECK ("status" IN ('CONFIGURADA'));

ALTER TABLE "subcontas_twilio" ADD CONSTRAINT "subcontas_twilio_ultimos4_check" CHECK (char_length("credencial_ultimos4") = 4);

ALTER TABLE "numeros_twilio_empresa" ADD CONSTRAINT "numeros_twilio_empresa_unico" UNIQUE ("empresa_id", "canal", "telefone_e164");

ALTER TABLE "numeros_twilio_empresa" ADD CONSTRAINT "numeros_twilio_canal_check" CHECK ("canal" IN ('WHATSAPP', 'SMS'));

ALTER TABLE "numeros_twilio_empresa" ADD CONSTRAINT "numeros_twilio_status_check" CHECK ("status" IN ('CADASTRADO', 'PENDENTE', 'ATIVO', 'INATIVO'));

ALTER TABLE "numeros_twilio_empresa" ADD CONSTRAINT "numeros_twilio_e164_check" CHECK ("telefone_e164" ~ '^\+[1-9][0-9]{7,14}$');

CREATE INDEX "numeros_twilio_empresa_empresa_id_canal_idx" ON "numeros_twilio_empresa"("empresa_id", "canal");

-- Um padrão por empresa e canal. O Prisma não expressa índice parcial.
CREATE UNIQUE INDEX "numeros_twilio_um_padrao" ON "numeros_twilio_empresa" ("empresa_id", "canal") WHERE "padrao";

ALTER TABLE "subcontas_twilio" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "numeros_twilio_empresa" ENABLE ROW LEVEL SECURITY;
