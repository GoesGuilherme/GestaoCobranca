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

Em produção, defina `SEED_OWNER_EMAIL` e `SEED_OWNER_SENHA` com uma senha forte antes de rodar o seed, e use `SEED_EXEMPLOS=false` para não gravar esses clientes fictícios. Se o e-mail já existir, o seed não troca a senha.

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
| `DATABASE_URL` | Conexão usada pela aplicação. |
| `DIRECT_URL` | Conexão usada pelo Prisma Migrate. No computador local, igual à `DATABASE_URL`. |
| `AUTH_SECRET` | Segredo do cookie de sessão. Use uma string longa e aleatória (`openssl rand -base64 32`). |
| `SEED_OWNER_NOME` | Nome de quem acessa o sistema. |
| `SEED_OWNER_EMAIL` | E-mail desse acesso. |
| `SEED_OWNER_SENHA` | Senha inicial. Só é gravada se o e-mail ainda não existir. |
| `SEED_EXEMPLOS` | `true` grava os clientes fictícios. `false` grava só o acesso. |

## Publicar

O aplicativo é Next.js e o banco é PostgreSQL. A combinação prevista é a aplicação na Vercel (ou qualquer host Node 22) e o banco no Supabase.

### Banco no Supabase

1. Crie um projeto no Supabase.
2. Copie a conexão direta (host `db.<ref>.supabase.co`, porta 5432) para `DIRECT_URL`. Ela serve para `npx prisma migrate deploy`.
3. Na aplicação de longa duração, `DATABASE_URL` pode ser a mesma conexão direta. Em ambiente serverless, use o pooler do Supabase em modo sessão e deixe a conexão direta só no `DIRECT_URL`.
4. Rode as migrations contra esse banco: `npx prisma migrate deploy`.
5. Defina `SEED_OWNER_SENHA` com uma senha forte e `SEED_EXEMPLOS=false`.
6. Rode `npx prisma db seed` para criar o acesso. Apague os clientes de exemplo se eles tiverem sido gravados por engano.

### Aplicação

- Configure `DATABASE_URL`, `DIRECT_URL` e `AUTH_SECRET` no host.
- O build executa `prisma generate` e em seguida `next build`.
- As migrations não rodam no build. Aplique `prisma migrate deploy` no banco antes de abrir o tráfego.
- O cookie de sessão fica `secure` quando `NODE_ENV` é `production`.

## Como o código está organizado

- `src/lib` — CPF/CNPJ, máscaras, rótulos e os esquemas de validação usados tanto na tela quanto no servidor.
- `src/server/services` — regras de cliente, filial e painel. É a única camada que grava esses dados. O arquivo `src/server/services/index.ts` é o ponto de entrada estável.
- `src/app/api` — rotas HTTP finas em cima desses serviços. As telas chamam essas rotas para criar, editar e excluir.
- `prisma/schema.prisma` — `Cliente` 1-N `Filial`, mais o `Usuario` do acesso.

Um servidor MCP futuro (`buscar cliente`, `listar filiais`, e as ações de escrita) deve importar os serviços, não o Prisma. Os próximos módulos entram como tabela, serviço e rota próprios, com chave para o cliente e, quando fizer sentido, para a filial:

- licenças do PDVLegal;
- certificados digitais A1 e a data de vencimento;
- boletos e a situação do pagamento na Cora;
- histórico de chamados de suporte;
- cobrança, que é o módulo central do nome do repositório.

## CPF e CNPJ

O cliente aceita CPF ou CNPJ. A filial aceita CNPJ. A validação usa o cálculo dos dígitos verificadores. No CNPJ, a raiz pode ter letras (formato alfanumérico): o valor de cada caractere é o código ASCII menos 48, e os dois dígitos verificadores continuam numéricos. O documento é guardado sem pontuação e mostrado com máscara.
