# Gestão Cobrança

Cadastro interno dos clientes de uma revenda de PDVLegal (automação comercial da WebAutomação). Os clientes são restaurantes e mercados autônomos espalhados pelo Brasil.

No back office do PDVLegal, cada cliente é um **grupo** e cada ponto de venda é uma **filial**. Um grupo pode ter várias filiais. Esta primeira versão cuida só desse cadastro: quem é o cliente e quais são as unidades.

Licenças do PDVLegal, certificados digitais A1, boletos da Cora, chamados de suporte e a cobrança em si ficam para as próximas versões. O código já separa a regra de negócio da tela para esses módulos entrarem sem reescrever o cadastro.

A interface, as mensagens de validação e este texto estão em português do Brasil.

## O que dá para fazer

- Entrar com e-mail e senha. Não há tela de cadastro de novas pessoas: o acesso é da pessoa dona do sistema.
- Ver um painel com a quantidade de clientes por status e por segmento.
- Buscar clientes por nome fantasia, razão social, CPF/CNPJ ou cidade.
- Filtrar por segmento (restaurante, mercado autônomo, outro) e por status (ativo, inativo, em implantação).
- Cadastrar, editar e excluir clientes.
- Na página do cliente, cadastrar, editar e excluir filiais. A exclusão pede confirmação. Excluir o cliente também apaga as filiais dele.

## Como rodar neste computador

É preciso Node.js 22 e um PostgreSQL 16. O caminho mais simples é o Docker.

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

O `docker compose` sobe o Postgres na porta 5432, cria o banco `gestaocobranca` e, na primeira inicialização do volume, também o banco `gestaocobranca_test` usado pelos testes.

Se você já tem um PostgreSQL, crie o usuário e os bancos e aponte o `.env`:

```sql
CREATE USER gestao WITH PASSWORD 'gestao';
CREATE DATABASE gestaocobranca OWNER gestao;
CREATE DATABASE gestaocobranca_test OWNER gestao;
```

### Acesso de exemplo

O seed cria um acesso fictício, só para desenvolvimento:

- E-mail: `marina@exemplo.test`
- Senha: `exemplo-1234`

Os clientes gravados pelo seed têm **Exemplo** no nome. CPF, CNPJ, telefones e e-mails são inventados. Não são empresas reais.

O seed recusa rodar quando `NODE_ENV` é `production`. Em produção o primeiro acesso sai de `npm run criar-admin`, não do seed.

## Testes

```bash
npm test
```

O comando cria o banco `gestaocobranca_test` se ele ainda não existir (usando o usuário do `.env`), aplica as migrations nele e roda:

- a validação de CPF e CNPJ, inclusive o CNPJ alfanumérico;
- o serviço de clientes (cadastro, busca, filtro, atualização, exclusão em cascata);
- o serviço de filiais.

Os testes apagam apenas as tabelas de clientes e filiais desse banco de teste.

## Variáveis

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL` | Conexão da aplicação. Na Vercel, o pooler de transação do Supabase (porta 6543) com `?pgbouncer=true`. |
| `DIRECT_URL` | Conexão do Prisma Migrate. Direta ou pooler em modo sessão, porta 5432. No computador local, igual à `DATABASE_URL`. |
| `AUTH_SECRET` | Segredo do cookie de sessão. Use uma string longa e aleatória (`openssl rand -base64 32`). |
| `SEED_OWNER_NOME` | Nome do acesso fictício do seed local. |
| `SEED_OWNER_EMAIL` | E-mail desse acesso. |
| `SEED_OWNER_SENHA` | Senha do seed local. Só é gravada se o e-mail ainda não existir. |
| `SEED_EXEMPLOS` | `true` grava os clientes fictícios no seed local. `false` grava só o acesso de exemplo. |
| `ADMIN_NOME` | Nome do primeiro acesso real. Só para `npm run criar-admin`. |
| `ADMIN_EMAIL` | E-mail desse acesso. |
| `ADMIN_SENHA` | Senha em texto. O script grava o hash e não altera a senha se o e-mail já existir. |

## Publicar no Supabase e na Vercel

O banco de produção já está no Supabase, região sa-east-1. As tabelas e o RLS foram aplicados à mão, com o SQL de `prisma/migrations/20261020225413_init` e o de `20261021180000_enable_rls`. Esse banco ainda não tem a tabela `_prisma_migrations` e não tem linhas. A aplicação sobe na Vercel.

O Prisma 7 não aceita `url` nem `directUrl` dentro de `schema.prisma`. O papel do antigo `directUrl` está em `prisma.config.ts`: as migrations leem `DIRECT_URL`. O servidor Next lê `DATABASE_URL`.

### Connection strings no painel do Supabase

No projeto, abra **Connect** (ou **Project Settings → Database**). Escolha o formato URI e copie duas URLs.

- **Transaction pooler**, porta **6543**, host com `pooler.supabase.com` e a região `sa-east-1`. Essa é a `DATABASE_URL`. Confira se a URL termina com `?pgbouncer=true`. Se o painel não incluir esse parâmetro, acrescente. O adapter não usa prepared statements nomeados, que é o que o pooler de transação exige; o driver `pg` ignora o parâmetro `pgbouncer` em si.
- **Session pooler** (porta 5432 no mesmo host do pooler) ou **Direct connection** (`db.<ref>.supabase.co`, porta 5432). Essa é a `DIRECT_URL`. Não use a porta 6543 aqui: o `prisma migrate` não atravessa o pooler de transação.

Se a senha do banco tiver `@`, `#` ou espaço, troque esses caracteres pelo código percentual na URL, ou gere outra senha no painel.

O RLS está ligado nas três tabelas e não há política. O papel `postgres`, usado por essas duas URLs, ignora o RLS. A API REST pública do Supabase continua sem acesso.

### Variáveis na Vercel

Em **Project Settings → Environment Variables**, no ambiente Production (e no Preview, se ele apontar para um banco):

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Pooler de transação, porta 6543, com `?pgbouncer=true` |
| `DIRECT_URL` | Conexão direta ou pooler em modo sessão, porta 5432 |
| `AUTH_SECRET` | Saída de `openssl rand -base64 32` |

As três precisam existir no build e em runtime. O `postinstall` e o script `build` rodam `prisma generate`, e o arquivo `prisma.config.ts` lê `DIRECT_URL` ao carregar. A aplicação lê `DATABASE_URL` e `AUTH_SECRET` quando atende um pedido. O cookie de sessão sai com `secure` quando `NODE_ENV` é `production`.

Não defina `ADMIN_SENHA` na Vercel e não rode `npm run db:seed` contra o banco de produção. O seed de exemplo está bloqueado quando `NODE_ENV` é `production`.

O build da Vercel não aplica migration. O banco de produção já tem as tabelas.

### Registrar as migrations que já rodaram

Na sua máquina, com `DIRECT_URL` apontando para o Supabase de produção (confira o host antes de continuar):

```bash
npx prisma migrate resolve --applied 20261020225413_init
npx prisma migrate resolve --applied 20261021180000_enable_rls
```

Isso só escreve o histórico em `_prisma_migrations`. Não rode `prisma migrate deploy` antes desses dois comandos: o deploy tentaria criar de novo os tipos e as tabelas, e falharia. Depois do resolve, `npx prisma migrate deploy` deve dizer que não há migration pendente.

Num banco vazio, no futuro, o caminho normal continua sendo `npx prisma migrate deploy`, que aplica as duas migrations em ordem. A pasta `database/` é uma cópia legível desses SQLs; a fonte da verdade continua em `prisma/migrations`.

### Primeiro acesso

Com `DATABASE_URL` (ou, se só ela existir, `DIRECT_URL`) apontando para o mesmo banco:

```bash
ADMIN_NOME="Seu Nome" \
ADMIN_EMAIL="voce@seudominio.com" \
ADMIN_SENHA="uma-senha-longa" \
npm run criar-admin
```

O script grava o hash da senha do mesmo jeito que o login confere. Se o e-mail já existir, ele para e não troca a senha.

## Como o código está organizado

- `src/lib` — CPF/CNPJ, máscaras, rótulos e os esquemas de validação usados tanto na tela quanto no servidor.
- `src/server/services` — regras de cliente, filial e painel. É a única camada que grava esses dados. O arquivo `src/server/services/index.ts` é o ponto de entrada estável.
- `src/app/api` — rotas HTTP finas em cima desses serviços. As telas chamam essas rotas para criar, editar e excluir.
- `prisma/schema.prisma` — `Cliente` 1-N `Filial`, mais o `Usuario` do acesso. As migrations em `prisma/migrations` são a fonte da verdade do banco.
- `database/` — os mesmos SQLs, com comentário curto, para quem não usa o Prisma.

Um servidor MCP futuro (`buscar cliente`, `listar filiais`, e as ações de escrita) deve importar os serviços, não o Prisma. Os próximos módulos entram como tabela, serviço e rota próprios, com chave para o cliente e, quando fizer sentido, para a filial:

- licenças do PDVLegal;
- certificados digitais A1 e a data de vencimento;
- boletos e a situação do pagamento na Cora;
- histórico de chamados de suporte;
- cobrança, que é o módulo central do nome do repositório.

## CPF e CNPJ

O cliente aceita CPF ou CNPJ. A filial aceita CNPJ. A validação usa o cálculo dos dígitos verificadores. No CNPJ, a raiz pode ter letras (formato alfanumérico): o valor de cada caractere é o código ASCII menos 48, e os dois dígitos verificadores continuam numéricos. O documento é guardado sem pontuação e mostrado com máscara.
