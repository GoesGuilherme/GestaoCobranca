-- Espelho de prisma/migrations/20261023143138_custo_imposto_servico/migration.sql
-- Custo e alíquota de impostos opcionais no catálogo de serviços.

-- AlterTable
ALTER TABLE "servicos" ADD COLUMN     "aliquota_imposto" DECIMAL(5,2),
ADD COLUMN     "custo" DECIMAL(12,2);
