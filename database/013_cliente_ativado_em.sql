-- Espelha prisma/migrations/20261029140000_cliente_ativado_em.
-- Não aplicar em produção por este arquivo. A fonte da verdade é o Prisma Migrate.
-- Só preenche ativado_em vazio. Não altera observacoes.

ALTER TABLE "clientes" ADD COLUMN "ativado_em" DATE;

DO $$
DECLARE
  linha RECORD;
  texto TEXT;
  dia DATE;
  hoje DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  FOR linha IN
    SELECT id, observacoes
    FROM "clientes"
    WHERE "ativado_em" IS NULL
      AND observacoes ~ '1ª ativação OEM [0-9]{2}/[0-9]{2}/[0-9]{4}'
  LOOP
    texto := (regexp_match(linha.observacoes, '1ª ativação OEM ([0-9]{2}/[0-9]{2}/[0-9]{4})'))[1];
    BEGIN
      dia := to_date(texto, 'DD/MM/YYYY');
    EXCEPTION
      WHEN OTHERS THEN
        dia := NULL;
    END;
    IF dia IS NOT NULL
      AND to_char(dia, 'DD/MM/YYYY') = texto
      AND dia <= hoje THEN
      UPDATE "clientes"
      SET "ativado_em" = dia
      WHERE id = linha.id
        AND "ativado_em" IS NULL;
    END IF;
  END LOOP;

  -- UAI CAFE CARREFOUR, CNPJ 50.783.953/0001-41, confirmado no extrato OEM.
  UPDATE "clientes"
  SET "ativado_em" = DATE '2026-06-24'
  WHERE "ativado_em" IS NULL
    AND regexp_replace("documento", '\D', '', 'g') = '50783953000141';
END $$;
