-- Logo da empresa para os e-mails de aviso da régua.
-- O arquivo fica nesta tabela. O Postgres de teste não tem o schema storage,
-- então a URL pública é servida pela aplicação em /api/publico/logos/:id.
-- Sem política, a API REST do Supabase não lê o binário.
-- O app entra como dono da tabela e ignora o RLS.

CREATE TABLE "logos_empresa" (
    "empresa_id" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "logos_empresa_pkey" PRIMARY KEY ("empresa_id")
);

ALTER TABLE "logos_empresa" ADD CONSTRAINT "logos_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "logos_empresa" ADD CONSTRAINT "logos_empresa_mime_check" CHECK ("mime" IN ('image/png', 'image/jpeg'));

ALTER TABLE "logos_empresa" ADD CONSTRAINT "logos_empresa_tamanho_check" CHECK (octet_length("conteudo") > 0 AND octet_length("conteudo") <= 524288);

ALTER TABLE "logos_empresa" ENABLE ROW LEVEL SECURITY;
