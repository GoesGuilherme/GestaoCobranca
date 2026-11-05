-- Espelha prisma/migrations/20261105160000_papel_banco_app.
-- Não aplicar em produção por este arquivo. A fonte da verdade é o Prisma Migrate.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taguaro_app') THEN
    CREATE ROLE taguaro_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT taguaro_app TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO taguaro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO taguaro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO taguaro_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO taguaro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO taguaro_app;

DO $$
DECLARE
  tabela record;
BEGIN
  FOR tabela IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela.relname);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tabela.relname AND policyname = 'taguaro_app_acesso'
    ) THEN
      EXECUTE format(
        'CREATE POLICY taguaro_app_acesso ON %I FOR ALL TO taguaro_app USING (true) WITH CHECK (true)',
        tabela.relname
      );
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;
