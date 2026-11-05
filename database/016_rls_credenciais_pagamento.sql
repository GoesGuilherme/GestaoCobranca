-- Espelha prisma/migrations/20261105151000_rls_credenciais_pagamento.
-- Não aplicar em produção por este arquivo. A fonte da verdade é o Prisma Migrate.

ALTER TABLE "configuracoes_pagamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_pagamento" ENABLE ROW LEVEL SECURITY;
