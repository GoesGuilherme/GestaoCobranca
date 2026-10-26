-- Espelho de prisma/migrations/20261026230000_cliente_bloqueado/migration.sql
-- Inclui o status Bloqueado no cadastro do cliente.

ALTER TYPE "status_cliente" ADD VALUE 'BLOQUEADO';
