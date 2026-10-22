# Scripts SQL

Estes arquivos existem para quem quiser ler o banco sem abrir o Prisma. Eles espelham as migrations, na mesma ordem:

1. `001_criar_tabelas.sql` — tipos, tabelas, índices e a chave de filial para cliente. Espelha `prisma/migrations/20261020225413_init`.
2. `002_habilitar_rls.sql` — liga o row level security nas três tabelas, sem políticas. Espelha `prisma/migrations/20261021180000_enable_rls`.
3. `003_multiempresa.sql` — cria a empresa, liga usuários e clientes nela, troca a unicidade do CPF/CNPJ para valer por empresa e liga o RLS nas tabelas novas. Espelha `prisma/migrations/20261021235900_multiempresa`.

A fonte da verdade é a pasta `prisma/migrations`. Se uma migration nova entrar, estes scripts precisam ser atualizados para continuar iguais a ela. Não rode os dois jeitos no mesmo banco: ou o Prisma Migrate, ou estes arquivos, nunca os dois em sequência no mesmo esquema vazio.

No projeto de produção do Supabase (região sa-east-1, ref `ziqjcworupopkcnfddjr`) os scripts 001 e 002 já foram aplicados. O `003_multiempresa.sql` ainda não: ele entra com `npx prisma migrate deploy` depois do merge, como está na seção "Publicar no Supabase e na Vercel" do README da raiz.

Esse terceiro script cria a empresa Collab Software com o CNPJ placeholder `00000000000000`. Esse número não é um CNPJ válido e precisa ser trocado na tela Empresa. O usuário `guilherme.goes@collabsoftware.com.br` fica dono dessa empresa e superadministrador da plataforma. Clientes que já existirem passam a pertencer a ela.
