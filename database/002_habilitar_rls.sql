-- Espelho de prisma/migrations/20261021180000_enable_rls/migration.sql
-- Liga o RLS sem criar política de propósito.
-- A aplicação entra pelo servidor com o papel postgres, que ignora o RLS.
-- A API REST pública do Supabase (anon e authenticated) fica sem acesso.

ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "filiais" ENABLE ROW LEVEL SECURITY;
