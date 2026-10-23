-- AlterTable
ALTER TABLE "servicos" ADD COLUMN "custo" DECIMAL(12,2),
ADD COLUMN "aliquota_imposto" DECIMAL(5,2);

-- Custo e alíquota são opcionais. Quando preenchidos, não podem ser negativos.
-- A alíquota é um percentual sobre o preço (0 a 100), não um valor em reais.
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_custo_check" CHECK ("custo" IS NULL OR "custo" >= 0);
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_aliquota_imposto_check" CHECK (
    "aliquota_imposto" IS NULL OR ("aliquota_imposto" >= 0 AND "aliquota_imposto" <= 100)
);
