# Scripts SQL

Estes arquivos existem para quem quiser ler o banco sem abrir o Prisma. Eles espelham as migrations, na mesma ordem:

1. `001_criar_tabelas.sql` — tipos, tabelas, índices e a chave de filial para cliente. Espelha `prisma/migrations/20261020225413_init`.
2. `002_habilitar_rls.sql` — liga o row level security nas três tabelas, sem políticas. Espelha `prisma/migrations/20261021180000_enable_rls`.
3. `003_multiempresa.sql` — cria a empresa, liga usuários e clientes nela, troca a unicidade do CPF/CNPJ para valer por empresa e liga o RLS nas tabelas novas. Espelha `prisma/migrations/20261021235900_multiempresa`.
4. `004_servicos.sql` — catálogo de serviços da empresa e o valor combinado com cada cliente. Liga o RLS nas tabelas novas, exige valor não negativo e recusa vínculo com cliente ou serviço de outra empresa. Espelha `prisma/migrations/20261022175334_servicos`.
5. `005_custo_imposto_servico.sql` — custo e alíquota de impostos opcionais no catálogo. Os dois aceitam nulo; preenchidos, não podem ser negativos, e a alíquota fica entre 0 e 100. Espelha `prisma/migrations/20261023143138_custo_imposto_servico`.
6. `006_custo_vinculo_cliente.sql` — custo opcional em cada serviço vendido. Copia o custo atual do catálogo para os vínculos existentes e exige nulo ou valor não negativo. Espelha `prisma/migrations/20261023152120_custo_vinculo_cliente`.

A fonte da verdade é a pasta `prisma/migrations`. Se uma migration nova entrar, estes scripts precisam ser atualizados para continuar iguais a ela. Não rode os dois jeitos no mesmo banco: ou o Prisma Migrate, ou estes arquivos, nunca os dois em sequência no mesmo esquema vazio.

No projeto de produção do Supabase (região sa-east-1, ref `ziqjcworupopkcnfddjr`) as migrations até `20261023143138_custo_imposto_servico` já foram aplicadas com o Prisma Migrate. O `006_custo_vinculo_cliente.sql` ainda não: ele entra com `npx prisma migrate deploy` depois do merge. Estes arquivos só espelham esse SQL para leitura. Este repositório não aplica migration no banco de produção.

Esse terceiro script cria a empresa Collab Software com o CNPJ placeholder `00000000000000`. Esse número não é um CNPJ válido e precisa ser trocado na tela Empresa. O usuário `guilherme.goes@collabsoftware.com.br` fica dono dessa empresa e superadministrador da plataforma. Clientes que já existirem passam a pertencer a ela.
