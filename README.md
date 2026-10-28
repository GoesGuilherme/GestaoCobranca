# Taguaro

Sistema de cadastro e cobrança para várias empresas assinantes. Cada empresa vê só os próprios clientes, serviços e faturas.

O cliente é quem a empresa atende e pode ter várias unidades (filiais). A empresa monta o próprio catálogo, vende por cliente e cobra pelo Asaas: fatura avulsa, mensalidade recorrente e webhook. Nada de texto, vencimento ou encargos fica preso a uma empresa específica. A Cora não entra neste código.

A interface, as mensagens de validação e este texto estão em português do Brasil.

Cada empresa assinante vê só os próprios clientes e filiais. O CPF/CNPJ do cliente é único dentro da empresa, não no sistema inteiro.

## O que dá para fazer

- Cadastrar a própria empresa em `/cadastro`. A primeira pessoa vira dona da conta.
- Entrar com e-mail e senha. Empresa suspensa não entra.
- O dono cadastra outras pessoas da mesma empresa, com papel de dono, financeiro ou suporte.
- Quem administra a plataforma lista as empresas, abre uma conta nova com o primeiro dono e suspende ou reativa. Suspender a própria empresa é bloqueado.
- Ver um painel com a quantidade de clientes por status e por segmento, só da empresa logada.
- Buscar clientes por nome fantasia, razão social, CPF/CNPJ ou cidade.
- Filtrar por segmento (restaurante, mercado autônomo, outro) e por status (ativo, inativo, em implantação).
- Cadastrar, editar e excluir clientes.
- Na página do cliente, cadastrar, editar e excluir filiais. A exclusão pede confirmação. Excluir o cliente também apaga as filiais dele.
- Manter um catálogo de serviços da empresa (nome, descrição, preço padrão e, se quiser, custo padrão e alíquota de impostos) em Serviços. A margem do catálogo é o preço padrão menos o custo padrão menos o imposto percentual.
- Na ficha e na edição do cliente, vincular um ou mais serviços com o valor combinado, o custo daquela venda, se a cobrança é mensal ou avulsa, a data de início e se está ativo. Preço e custo do catálogo só sugerem o vínculo novo; não reescrevem o que já foi vendido. A alíquota continua no catálogo e incide sobre o valor combinado.
- Dono e financeiro alteram serviços, valores, custo e impostos, e veem a margem. Suporte consulta o preço e não vê custo, impostos nem margem. Os outros papéis continuam como antes: todo mundo autenticado altera clientes e filiais; só o dono altera usuários e os dados da empresa.
- Ver o resultado de custo e faturamento em Resultado, só o dono. O mensal reúne serviços recorrentes ativos de clientes ativos ou em implantação. O avulso fica separado. Custo vazio entra como zero e a página avisa que a margem pode estar alta demais.
- O dono configura o Asaas da empresa em Asaas: ambiente sandbox ou produção, chave da API cifrada, token do webhook e as preferências de cobrança (forma, dia, modelo de descrição, multa, juros, desconto e atualização das cobranças em aberto). A tela mostra a chave mascarada e tem o botão Testar conexão.
- Dono e financeiro veem, emitem e cancelam cobrança avulsa (boleto, Pix ou o cliente escolhe), a lista Faturas em aberto, a recorrência das vendas mensais e a importação. Suporte não vê o menu, a seção na ficha do cliente, a segunda via, a recorrência nem as rotas de fatura. O cliente é criado no Asaas na primeira cobrança, ou reaproveitado pelo CPF/CNPJ.
- O webhook `POST /api/webhooks/asaas` autentica o cabeçalho `asaas-access-token` de cada empresa e atualiza a situação da cobrança sem processar o mesmo evento duas vezes.

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

Quem esquece a senha pede um link em Esqueci minha senha. O e-mail sai pela Resend da plataforma (`AUTH_RESEND_API_KEY` e `AUTH_EMAIL_FROM`), não pela chave que cada empresa grava na régua. O endereço de envio precisa estar num domínio já verificado. Sem essas variáveis o pedido falha com um aviso genérico e o link não aparece no log.

O seed recusa rodar quando `NODE_ENV` é `production`. Em produção o primeiro acesso da Collab já nasce na migration multiempresa. `npm run criar-admin` ainda serve para criar outro superadministrador nessa empresa, se o e-mail ainda não existir.

A migration `20261021235900_multiempresa` cria a empresa **Collab Software** e liga nela os usuários e clientes que já existirem. O CNPJ gravado é `00000000000000`. **Esse número é um placeholder, não é um CNPJ válido, e precisa ser trocado** na tela Empresa pelo dono. O e-mail `guilherme.goes@collabsoftware.com.br` fica como dono dessa empresa e superadministrador da plataforma. Outros usuários que já existirem entram na mesma empresa como donos, sem o flag da plataforma.

## Testes

```bash
npm test
```

O comando cria o banco `gestaocobranca_test` se ele ainda não existir (usando o usuário do `.env`), aplica as migrations nele e roda:

- a validação de CPF e CNPJ, inclusive o CNPJ alfanumérico;
- o serviço de clientes (cadastro, busca, filtro, atualização, exclusão em cascata);
- o serviço de filiais;
- o isolamento: a empresa A não lê, edita nem apaga cliente, filial, serviço ou valor combinado da empresa B, e o mesmo documento pode existir nas duas;
- o catálogo de serviços, o valor combinado, o papel de quem pode alterá-lo e a receita mensal do painel;
- o resultado de custo e faturamento, visível só ao dono;
- a configuração do Asaas, a emissão e o cancelamento de fatura com cliente HTTP simulado, o webhook idempotente, e a regra de que só dono e financeiro veem faturas;
- o autocadastro, o limite de tentativas, a empresa suspensa e o papel de quem cadastra usuário.

Os testes apagam empresas, usuários, clientes, filiais, serviços, vínculos, faturas, a configuração do Asaas, a régua, os lembretes, os eventos de webhook e o limite de cadastro desse banco de teste.

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
| `ASAAS_ENCRYPTION_KEY` | 32 bytes em base64 (`openssl rand -base64 32`). Cifra, no banco, a chave da API do Asaas, o token do webhook e a chave da Resend de cada empresa. Não é a chave da API e não pode ir para o repositório. Sem ela, a tela Asaas e a régua não gravam nem leem esses segredos. |
| `CRON_SECRET` | Segredo da rota diária `/api/cron/regua`. A Vercel Cron envia `Authorization: Bearer`. Sem ele a rota responde 500 e não envia. Não é a chave da Resend. |
| `ASAAS_MOCK` | Só no computador de desenvolvimento. `true` usa um Asaas em memória, sem rede e sem chave real, para a tela funcionar antes de existir a chave. Se `NODE_ENV` for `production`, a aplicação recusa esse modo. Não defina na Vercel. |

## Publicar no Supabase e na Vercel

O banco de produção já está no Supabase, região sa-east-1, projeto `ziqjcworupopkcnfddjr`. As tabelas iniciais e o RLS foram aplicados à mão, com o SQL de `prisma/migrations/20261020225413_init` e o de `20261021180000_enable_rls`. A aplicação sobe na Vercel.

A migration `20261021235900_multiempresa` **não é aplicada por este repositório no banco de produção**. Depois do merge, na sua máquina, com `DIRECT_URL` apontando para esse projeto:

```bash
npx prisma migrate deploy
```

Esse comando aplica só o que ainda falta. Se `_prisma_migrations` ainda não registrar as duas primeiras, marque-as antes, senão o deploy tenta criar de novo tipos que já existem:

```bash
npx prisma migrate resolve --applied 20261020225413_init
npx prisma migrate resolve --applied 20261021180000_enable_rls
npx prisma migrate deploy
```

O deploy da multiempresa cria a Collab Software, liga o usuário existente e liga o RLS em `empresas` e `limites_cadastro`. Em seguida, entre como Guilherme e troque o CNPJ placeholder na tela Empresa. Sessões antigas deixam de valer: o cookie passou a carregar a empresa e o papel, então é preciso entrar de novo.

O Prisma 7 não aceita `url` nem `directUrl` dentro de `schema.prisma`. O papel do antigo `directUrl` está em `prisma.config.ts`: as migrations leem `DIRECT_URL`. O servidor Next lê `DATABASE_URL`.

### Connection strings no painel do Supabase

No projeto, abra **Connect** (ou **Project Settings → Database**). Escolha o formato URI e copie duas URLs.

- **Transaction pooler**, porta **6543**, host com `pooler.supabase.com` e a região `sa-east-1`. Essa é a `DATABASE_URL`. Confira se a URL termina com `?pgbouncer=true`. Se o painel não incluir esse parâmetro, acrescente. O adapter não usa prepared statements nomeados, que é o que o pooler de transação exige; o driver `pg` ignora o parâmetro `pgbouncer` em si.
- **Session pooler** (porta 5432 no mesmo host do pooler) ou **Direct connection** (`db.<ref>.supabase.co`, porta 5432). Essa é a `DIRECT_URL`. Não use a porta 6543 aqui: o `prisma migrate` não atravessa o pooler de transação.

Se a senha do banco tiver `@`, `#` ou espaço, troque esses caracteres pelo código percentual na URL, ou gere outra senha no painel.

O RLS fica ligado nas tabelas, sem política. O papel `postgres`, usado por essas duas URLs, ignora o RLS. A API REST pública do Supabase continua sem acesso. A migration multiempresa liga o RLS também em `empresas` e `limites_cadastro`.

### Variáveis na Vercel

Em **Project Settings → Environment Variables**, no ambiente Production (e no Preview, se ele apontar para um banco):

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Pooler de transação, porta 6543, com `?pgbouncer=true` |
| `DIRECT_URL` | Conexão direta ou pooler em modo sessão, porta 5432 |
| `AUTH_SECRET` | Saída de `openssl rand -base64 32` |
| `ASAAS_ENCRYPTION_KEY` | Outra saída de `openssl rand -base64 32`, diferente do `AUTH_SECRET` e diferente da chave da API do Asaas. A mesma chave cifra a Resend de cada empresa. |
| `CRON_SECRET` | Saída de `openssl rand -base64 32`. A Vercel Cron envia esse valor em `Authorization: Bearer` para `/api/cron/regua`. |

Não defina `ASAAS_MOCK` na Vercel. Em produção a integração chama `https://api.asaas.com/v3` ou `https://api-sandbox.asaas.com/v3`, conforme o ambiente salvo pelo dono, e envia a chave no cabeçalho `access_token`. A chave real ainda não entra neste repositório.

Essas variáveis precisam existir no build e em runtime. O `postinstall` e o script `build` rodam `prisma generate`, e o arquivo `prisma.config.ts` lê `DIRECT_URL` ao carregar. A aplicação lê `DATABASE_URL` e `AUTH_SECRET` quando atende um pedido. O cookie de sessão sai com `secure` quando `NODE_ENV` é `production`.

Não defina `ADMIN_SENHA` na Vercel e não rode `npm run db:seed` contra o banco de produção. O seed de exemplo está bloqueado quando `NODE_ENV` é `production`.

O build da Vercel não aplica migration.

Num banco vazio, no futuro, o caminho normal continua sendo `npx prisma migrate deploy`, que aplica as migrations em ordem. A pasta `database/` é uma cópia legível desses SQLs; a fonte da verdade continua em `prisma/migrations`.

### Primeiro acesso

Com `DATABASE_URL` (ou, se só ela existir, `DIRECT_URL`) apontando para o mesmo banco:

```bash
ADMIN_NOME="Seu Nome" \
ADMIN_EMAIL="voce@seudominio.com" \
ADMIN_SENHA="uma-senha-longa" \
npm run criar-admin
```

O script grava o hash da senha do mesmo jeito que o login confere, na empresa Collab Software, como dono e superadministrador. Se o e-mail já existir, ele para e não troca a senha. Não use este comando para o Guilherme depois da migration multiempresa: esse acesso já fica marcado.

## Como o código está organizado

- `src/lib` — CPF/CNPJ, máscaras, rótulos e os esquemas de validação usados tanto na tela quanto no servidor.
- `src/server/services` — regras de empresa, usuário, cliente, filial, serviço, resultado, Asaas e fatura. Cliente, fatura e configuração sempre recebem a empresa da sessão, nunca um id vindo do navegador. O arquivo `src/server/services/index.ts` é o ponto de entrada estável.
- `src/app/api` — rotas HTTP finas em cima desses serviços. As telas chamam essas rotas para criar, editar e excluir. `POST /api/webhooks/asaas` não usa o cookie: autentica o token da empresa.
- `prisma/schema.prisma` — `Empresa` 1-N `Usuario`, `Cliente` e `Servico`. `Cliente` 1-N `Filial`, `ClienteServico` e `Fatura`. `ClienteServico` guarda o valor combinado daquele cliente. `ConfiguracaoAsaas` e `PreferenciaCobranca` são uma por empresa. O campo `Empresa.plano` continua sendo a assinatura da empresa na plataforma, separado desse catálogo e separado da cobrança no Asaas. As migrations em `prisma/migrations` são a fonte da verdade do banco.
- `database/` — os mesmos SQLs, com comentário curto, para quem não usa o Prisma.

Um servidor MCP futuro (`buscar cliente`, `listar filiais`, e as ações de escrita) deve importar os serviços, não o Prisma. Os próximos módulos entram como tabela, serviço e rota próprios:

- histórico de chamados de suporte;
- planos da plataforma para a empresa assinante, separados do catálogo que ela vende aos clientes dela.

Dono e financeiro ativam a cobrança recorrente nas vendas `MENSAL` ativas. Forma, dia de vencimento, texto da descrição, multa, juros, desconto e a opção de atualizar cobranças em aberto começam pelas preferências da empresa, gravadas pelo dono em Asaas. Cada venda e o lote podem trocar esses valores. Sem percentual informado, a cobrança não envia multa, juros nem desconto, e o Asaas conserva o padrão da conta. O prazo de gerar a cobrança antes do vencimento não vai na assinatura: o Asaas usa 7, 14 ou 40 dias na configuração da conta, e o número escolhido fica só na preferência. A assinatura usa ciclo mensal. Dá para editar, pausar ou cancelar. O lote mostra a prévia antes de criar. As cobranças da assinatura entram em Faturas pelo webhook (o pagamento traz o campo `subscription`) e pelo botão Importar faturas, sem duplicar. Suporte não vê faturas nem recorrência. A chave da API continua só com o dono.

A régua de cobrança fica em Régua, só para o dono alterar e para o financeiro consultar. A empresa liga a régua, monta várias réguas nomeadas (uma é a padrão) e define, em cada uma, os passos, o horário e se o e-mail sai no fim de semana. O cliente usa a padrão, outra régua, nenhuma, ou fica pausado. O passo pode ser na emissão ou em dias antes, no vencimento ou em atraso, com assunto e texto usando `{cliente}`, `{servico}`, `{valor}`, `{vencimento}`, `{link}`, `{dias_atraso}` e `{empresa}`. O canal desta versão é o e-mail, pela Resend da própria empresa; a chave fica cifrada com `ASAAS_ENCRYPTION_KEY` e a tela só diz se ela está configurada. WhatsApp aparece desligado. O modo teste começa ligado: o envio diário vai para o dono e Enviar lembrete vai para quem está logado, até o dono desligar. A rota `/api/cron/regua` roda todo dia e exige `CRON_SECRET`. Fora de produção o envio não chama a Resend.

A forma também pode ser cartão de crédito. A assinatura nasce no Asaas com `billingType` `CREDIT_CARD` e sem dados de cartão: o cliente informa o cartão na página da primeira cobrança, e o Asaas passa a cobrar sozinho. A venda mostra “Aguardando cadastro do cartão” até o webhook confirmar o pagamento, “Cartão cadastrado” (só bandeira e quatro últimos dígitos, quando o Asaas os devolve) ou “Cartão recusado”. O número completo e o CVV não entram no banco nem no log. Qualquer cobrança com link pode ser copiada, aberta no WhatsApp de quem está usando o sistema ou no e-mail, com o texto gravado nas preferências da empresa (`{cliente}`, `{servico}`, `{valor}`, `{vencimento}`, `{link}`). Nada disso envia a mensagem sozinho.

A Cora não é alterada por estes módulos.

## CPF e CNPJ

O cliente aceita CPF ou CNPJ. A filial aceita CNPJ. A validação usa o cálculo dos dígitos verificadores. No CNPJ, a raiz pode ter letras (formato alfanumérico): o valor de cada caractere é o código ASCII menos 48, e os dois dígitos verificadores continuam numéricos. O documento é guardado sem pontuação e mostrado com máscara.
