-- O segmento fixo deixa de ser exigido no cadastro.
-- A coluna, o enum e os valores já gravados permanecem.
-- Cadastro novo que não informa o campo recebe OUTRO.
-- Esta migration não atualiza nem apaga linhas existentes.

ALTER TABLE "clientes" ALTER COLUMN "segmento" SET DEFAULT 'OUTRO';
