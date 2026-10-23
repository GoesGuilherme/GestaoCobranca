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
