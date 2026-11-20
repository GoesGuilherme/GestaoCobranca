-- Comprovante de pagamento recebido no WhatsApp.
-- APLICAR NO SUPABASE DE PRODUÇÃO ANTES DO MERGE.
-- Só acrescenta colunas, enum, tabela e índices. Não remove nem renomeia nada.
-- O binário fica na tabela. Sem política, a API REST do Supabase não lê.
-- O app entra como dono da tabela e ignora o RLS.

ALTER TABLE "empresas" ADD COLUMN "ler_comprovantes_whatsapp" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "faturas" ADD COLUMN "comprovante_pendente" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "faturas_empresa_id_comprovante_pendente_idx"
  ON "faturas"("empresa_id", "comprovante_pendente");

CREATE TYPE "situacao_comprovante" AS ENUM ('PENDENTE', 'CONFIRMADO', 'REJEITADO', 'SEM_FATURA');

CREATE TABLE "comprovantes_pagamento" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "cliente_id" TEXT,
  "fatura_id" TEXT,
  "message_sid" TEXT NOT NULL,
  "hash_conteudo" TEXT NOT NULL,
  "e2e" TEXT,
  "mime" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "valor_extraido" DECIMAL(12, 2),
  "pago_em" DATE,
  "hora" TEXT,
  "pagador" TEXT,
  "recebedor_nome" TEXT,
  "recebedor_documento" TEXT,
  "recebedor_chave" TEXT,
  "alertas" JSONB NOT NULL DEFAULT '[]',
  "situacao" "situacao_comprovante" NOT NULL DEFAULT 'PENDENTE',
  "motivo_rejeicao" TEXT,
  "usuario_id" TEXT,
  "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "comprovantes_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "comprovantes_pagamento_empresa_id_message_sid_key"
  ON "comprovantes_pagamento"("empresa_id", "message_sid");

CREATE INDEX "comprovantes_pagamento_empresa_id_situacao_idx"
  ON "comprovantes_pagamento"("empresa_id", "situacao");

CREATE INDEX "comprovantes_pagamento_empresa_id_hash_conteudo_idx"
  ON "comprovantes_pagamento"("empresa_id", "hash_conteudo");

CREATE INDEX "comprovantes_pagamento_empresa_id_e2e_idx"
  ON "comprovantes_pagamento"("empresa_id", "e2e");

CREATE INDEX "comprovantes_pagamento_fatura_id_idx"
  ON "comprovantes_pagamento"("fatura_id");

ALTER TABLE "comprovantes_pagamento"
  ADD CONSTRAINT "comprovantes_pagamento_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "comprovantes_pagamento"
  ADD CONSTRAINT "comprovantes_pagamento_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comprovantes_pagamento"
  ADD CONSTRAINT "comprovantes_pagamento_fatura_id_fkey"
  FOREIGN KEY ("fatura_id") REFERENCES "faturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comprovantes_pagamento" ENABLE ROW LEVEL SECURITY;
