-- Forma de cobrança por recorrência.
-- APLICAR NO BANCO ANTES DO DEPLOY. Esta mudança não foi aplicada em produção.
-- Só acrescenta coluna e índice. Não altera provedor_pagamento da empresa
-- nem o enum. A Collab que já está em PIX_DIRETO continua assim.
-- O preenchimento copia o provedor atual da empresa só para recorrência que
-- já emite, para a próxima fatura não trocar de banco sozinha.

ALTER TABLE "clientes_servicos"
  ADD COLUMN IF NOT EXISTS "provedor_recorrente" "provedor_pagamento";

UPDATE "clientes_servicos" AS cs
SET "provedor_recorrente" = e."provedor_pagamento"
FROM "empresas" AS e
WHERE cs."empresa_id" = e."id"
  AND cs."provedor_recorrente" IS NULL
  AND (
    cs."forma_cobranca_recorrente" IS NOT NULL
    OR cs."asaas_assinatura_status" IS NOT NULL
    OR cs."asaas_subscription_id" IS NOT NULL
    OR cs."id_assinatura_externa" IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS "clientes_servicos_empresa_id_provedor_recorrente_idx"
  ON "clientes_servicos"("empresa_id", "provedor_recorrente");
