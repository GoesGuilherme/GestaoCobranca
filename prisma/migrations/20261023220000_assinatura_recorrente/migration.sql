-- AlterTable
ALTER TABLE "clientes_servicos" ADD COLUMN "asaas_subscription_id" TEXT,
ADD COLUMN "asaas_assinatura_status" TEXT,
ADD COLUMN "forma_cobranca_recorrente" TEXT,
ADD COLUMN "dia_vencimento" INTEGER,
ADD COLUMN "proximo_vencimento" DATE,
ADD COLUMN "descricao_recorrente" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clientes_servicos_asaas_subscription_id_key" ON "clientes_servicos"("asaas_subscription_id");

-- O dia escolhido para a mensalidade fica entre 1 e 31. Meses curtos usam o último dia.
ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_dia_vencimento_check" CHECK ("dia_vencimento" IS NULL OR ("dia_vencimento" >= 1 AND "dia_vencimento" <= 31));

-- A forma da recorrência segue o que a tela oferece: boleto, Pix ou o cliente escolhe.
ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_forma_cobranca_recorrente_check" CHECK ("forma_cobranca_recorrente" IS NULL OR "forma_cobranca_recorrente" IN ('BOLETO', 'PIX', 'UNDEFINED'));

-- Preferências de cobrança da empresa. Não dependem da chave da API.
CREATE TABLE "preferencias_cobranca" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "forma_cobranca" TEXT NOT NULL DEFAULT 'BOLETO',
    "dia_vencimento" INTEGER NOT NULL DEFAULT 10,
    "modelo_descricao" TEXT NOT NULL DEFAULT 'Mensalidade {servico}',
    "multa_percentual" DECIMAL(5,2),
    "juros_percentual" DECIMAL(5,2),
    "desconto_percentual" DECIMAL(5,2),
    "desconto_dias_antes" INTEGER,
    "dias_antes_gerar" INTEGER,
    "atualizar_pendentes" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "preferencias_cobranca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preferencias_cobranca_empresa_id_key" ON "preferencias_cobranca"("empresa_id");

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_forma_cobranca_check" CHECK ("forma_cobranca" IN ('BOLETO', 'PIX', 'UNDEFINED'));

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_dia_vencimento_check" CHECK ("dia_vencimento" >= 1 AND "dia_vencimento" <= 31);

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_multa_percentual_check" CHECK ("multa_percentual" IS NULL OR ("multa_percentual" >= 0 AND "multa_percentual" <= 100));

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_juros_percentual_check" CHECK ("juros_percentual" IS NULL OR ("juros_percentual" >= 0 AND "juros_percentual" <= 100));

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_desconto_percentual_check" CHECK ("desconto_percentual" IS NULL OR ("desconto_percentual" >= 0 AND "desconto_percentual" <= 100));

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_desconto_dias_antes_check" CHECK ("desconto_dias_antes" IS NULL OR ("desconto_dias_antes" >= 0 AND "desconto_dias_antes" <= 30));

ALTER TABLE "preferencias_cobranca" ADD CONSTRAINT "preferencias_cobranca_dias_antes_gerar_check" CHECK ("dias_antes_gerar" IS NULL OR "dias_antes_gerar" IN (7, 14, 40));

ALTER TABLE "preferencias_cobranca" ENABLE ROW LEVEL SECURITY;
