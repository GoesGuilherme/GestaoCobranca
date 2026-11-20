-- Baixa manual de fatura paga fora do boleto.
-- APLICAR NO SUPABASE DE PRODUÇÃO ANTES DO MERGE.
-- Só acrescenta colunas. Não remove nem renomeia nada.

ALTER TABLE "faturas" ADD COLUMN "baixa_manual_em" TIMESTAMPTZ(3);

ALTER TABLE "conciliacoes_pagamento" ADD COLUMN "forma_recebimento" TEXT;
ALTER TABLE "conciliacoes_pagamento" ADD COLUMN "valor_recebido" DECIMAL(12, 2);
ALTER TABLE "conciliacoes_pagamento" ADD COLUMN "efeito_banco" TEXT;
ALTER TABLE "conciliacoes_pagamento" ADD COLUMN "aviso_banco" TEXT;
