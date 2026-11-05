-- As credenciais de banco e os eventos de pagamento nasceram sem RLS.
-- Liga o RLS sem criar política: a API REST pública do Supabase deixa de lê-las.
-- O app entra como dono e continua enxergando as tabelas.
-- Não apaga linha, coluna nem índice. Não mexe em asaas_* nem em faturas_criando_por_cliente.

ALTER TABLE "configuracoes_pagamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_pagamento" ENABLE ROW LEVEL SECURITY;
