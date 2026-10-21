# Scripts SQL

Estes arquivos existem para quem quiser ler o banco sem abrir o Prisma. Eles espelham as migrations, na mesma ordem:

1. `001_criar_tabelas.sql` — tipos, tabelas, índices e a chave de filial para cliente. Espelha `prisma/migrations/20261020225413_init`.
2. `002_habilitar_rls.sql` — liga o row level security nas três tabelas, sem políticas. Espelha `prisma/migrations/20261021180000_enable_rls`.

A fonte da verdade é a pasta `prisma/migrations`. Se uma migration nova entrar, estes scripts precisam ser atualizados para continuar iguais a ela. Não rode os dois jeitos no mesmo banco: ou o Prisma Migrate, ou estes arquivos, nunca os dois em sequência no mesmo esquema vazio.

No projeto de produção do Supabase (região sa-east-1) os dois já foram aplicados à mão. O passo que falta é só registrar isso no histórico do Prisma, como está na seção "Publicar no Supabase e na Vercel" do README da raiz.
