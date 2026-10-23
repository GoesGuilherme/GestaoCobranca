-- AlterTable
ALTER TABLE "clientes_servicos" ADD COLUMN "custo" DECIMAL(12,2);

-- O custo passa a ser de cada venda. Os vínculos que já existem recebem o
-- custo atual do catálogo, para a margem não mudar nesta atualização.
-- Mudar o catálogo depois não reescreve estas linhas.
UPDATE "clientes_servicos" AS "vinculo"
SET "custo" = "servico"."custo"
FROM "servicos" AS "servico"
WHERE "vinculo"."servico_id" = "servico"."id";

-- O custo do vínculo é opcional. Quando preenchido, não pode ser negativo.
ALTER TABLE "clientes_servicos" ADD CONSTRAINT "clientes_servicos_custo_check" CHECK ("custo" IS NULL OR "custo" >= 0);
