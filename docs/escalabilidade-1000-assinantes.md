# Taguaro: cabe 1.000 assinantes?

Revisão técnica de novembro de 2026. Olha o código e o schema. Não muda comportamento, não cria migration e não mexe em variável de ambiente.

Premissa do dono: 1.000 empresas assinantes, cada uma com cerca de 50 a 200 clientes finais. Na mesma ordem de grandeza, 50 mil a 200 mil clientes e 50 mil a 200 mil faturas por mês no sistema inteiro.

Números de preço, prazo de disco e volume de mensagem estão marcados como **estimativa**. Saem de páginas públicas da Vercel, do Supabase, do Asaas, da Resend e da Twilio/Meta consultadas nesta revisão, mais a conta em cima do código. Não houve leitura do banco de produção nem chamada que altere dado.

## Resumo executivo

**Não.** O cadastro, a cobrança e o isolamento por empresa aguentam o tamanho de cada assinante. O que não aguenta é o trabalho do dia: a régua, o WhatsApp e a sincronização de visualização rodam em dois crons, uma vez por dia, um pedido só, sem fila e sem retomada. Com dezenas de empresas a régua já fica apertada. Com 1.000, o pedido morre no meio e o resto do dia não sai.

O que está no caminho certo:

- Cada empresa tem os próprios clientes, a própria chave do Asaas, a própria régua e a própria subconta Twilio. A sessão de verdade vem do usuário no banco, não de um `empresa_id` enviado pelo navegador (`src/server/auth/acesso.ts`, linhas 22–38).
- O boleto recorrente nasce no Asaas (assinatura). O Taguaro espelha pelo webhook. Não existe um cron que emite 200 mil boletos. Esse desenho escala por conta do Asaas, não por um processo único nosso.
- A boca de jacaré já soma no Postgres. MRR, churn e LTV, com 50 a 200 mensalidades por empresa, cabem na memória. View materializada não é o que trava os 1.000.

O que quebra a meta:

1. **Régua** (`/api/cron/regua`, todo dia às 12:00 UTC, 9h em São Paulo). Um laço percorre todas as empresas com a régua ligada, carrega todas as faturas em aberto e manda e-mail um a um. Não declara `maxDuration`. Na Vercel o padrão é 300 segundos; o teto do plano Pro é 800 segundos (1.800 só em beta, função a função). A conta abaixo passa dos dois.
2. **WhatsApp.** No fim desse mesmo pedido, a fila manda no máximo 20 mensagens, somando todas as empresas. Uma vez por dia. A fila não esvazia.
3. **Visualização** (`/api/cron/visualizacoes`, 11:30 UTC, teto de 60 segundos, 40 faturas por empresa). A lista de empresas é fixa, da mais antiga para a mais nova, sem marcar onde parou. As primeiras dezenas rodam todo dia. As outras não rodam.
4. **Ninguém fica sabendo.** Log é `console.info` / `console.error`. Cron que estoura volta 504 e, no dia seguinte, começa de novo do zero.

Subir o `maxDuration` para 800 segundos ou 30 minutos não resolve. O trabalho do dia é maior do que isso, e o mesmo começo da lista seria refeito. O ajuste é fatiar por empresa, guardar o ponto e rodar várias vezes por hora. O plano Pro da Vercel permite cron de um em um minuto. O Hobby, não: lá o cron só pode ser diário.

## 1. Banco

### O que o schema já faz bem

Quase toda tabela quente tem `empresa_id` e índice que começa por ele. Exemplos em `prisma/schema.prisma`:

- faturas: `(empresa_id, excluida, status)` e `(empresa_id, visualizada)`, linhas 377–378. A régua filtra exatamente `empresaId + excluida: false + status in (PENDING, OVERDUE)` (`src/server/services/regua-job.ts`, linhas 76–77). Esse índice serve.
- unicidade do pagamento e da chave de idempotência por empresa, linhas 375–376.
- índice parcial `faturas_criando_por_cliente`, uma emissão `CRIANDO` por cliente (`prisma/migrations/20261029180000_fatura_criando/migration.sql`, linhas 13–15).
- evento do Asaas único por empresa (`schema.prisma`, linha 393).
- WhatsApp idempotente por `chave_idempotencia` e por `(empresa_id, message_sid, tipo, status)`.
- lembrete automático enviado uma vez por fatura e passo (`prisma/migrations/20261026180000_regua_cobranca/migration.sql`, linhas 87–91).

Gatilhos recusam fatura, serviço vendido, passo, lembrete, fila de WhatsApp e assessor quando o `empresa_id` não bate com o do pai. Não são `SECURITY DEFINER` e o `GRANT` público é revogado. Isso segura escrita cruzada mesmo se um serviço esquecer o filtro.

### Índices que faltam

Não são o motivo de dizer não aos 1.000. Com 50 a 200 clientes, a consulta de uma empresa continua pequena se o plano usar o índice de `empresa_id`. Ficam importantes quando o histórico passa de um ano ou quando o webhook procura telefone no meio de um pico.

| Consulta | Onde | Índice hoje | O que falta |
| --- | --- | --- | --- |
| Boca de jacaré e painel financeiro, por mês de vencimento | `boca-jacare-service.ts` 85–88; `painel-financeiro-service.ts` 77–91 | `(empresa_id, excluida, status)` não ordena por data | `(empresa_id, vencimento)` |
| Estoque de inadimplência, soma sem limite de data | `boca-jacare-service.ts` 91–97 | o mesmo | o mesmo índice limita a leitura à empresa; a soma ainda percorre o histórico dela |
| Cron de visualização: não vista, em aberto ou criada nos últimos 120 dias, ordem por vencimento | `visualizacao-fatura-service.ts` 33–45 e 62–66 | `(empresa_id, visualizada)` | índice parcial `(empresa_id, vencimento)` onde `excluida = false` e `visualizada = false` |
| Régua lista lembretes `ENVIADO` de um punhado de faturas | `regua-envios.ts` 15–26 | `(fatura_id, criado_em)` e `(empresa_id)` | aceitável no lote de 200; composto `(empresa_id, status, fatura_id)` quando a tabela de lembretes ficar grande |
| Assessor acha cliente pelo WhatsApp | `assessor-service.ts` 128–130 | `clientes.whatsapp` não tem índice. `filiais.whatsapp` tem (`schema.prisma`, linha 232) | `(empresa_id, whatsapp)` em `clientes` |
| Lista de clientes ordenada por nome | `cliente-service.ts` 103–107 | `empresa_id` e, separado, `nome_fantasia` global | `(empresa_id, nome_fantasia)` |
| Métricas, todos os vínculos mensais | `metricas-service.ts` 8–9 | `(empresa_id, status, recorrencia)` exige `status` no meio | `(empresa_id, recorrencia)` |

Índices globais de `nome_fantasia`, `cidade`, `status` e `segmento` em `clientes` (`schema.prisma`, linhas 206–209) não ajudam a consulta da empresa e custam escrita em toda inclusão. Trocar por compostos com `empresa_id` é limpeza, não urgência.

Busca com `contains` sem ancoragem (`cliente-service.ts` 92–99, `fatura-service.ts` 171–176) não usa índice btree. Com 200 nomes, a varredura da empresa é barata. `pg_trgm` só vale a pena se alguma empresa passar de alguns milhares de clientes.

### RLS

O RLS está ligado em todas as tabelas de negócio e **não há `CREATE POLICY` em nenhuma migration**. O comentário da régua diz o desenho com todas as letras (`prisma/migrations/20261026180000_regua_cobranca/migration.sql`, linhas 220–225): o aplicativo entra como dono da tabela e ignora o RLS; sem política, a API REST pública do Supabase não lê.

Isso fecha o PostgREST (papéis `anon` e `authenticated`). Não isola uma empresa da outra dentro do Prisma. O papel `postgres` da `DATABASE_URL` passa por cima do RLS, e não há `FORCE ROW LEVEL SECURITY`. O isolamento real é:

- `empresaId` gravado na sessão a partir da linha do usuário, não do corpo do pedido;
- `where` com essa empresa nos serviços;
- gatilhos de mesma empresa na escrita;
- testes em `src/server/services/isolamento.test.ts`.

Política RLS por `empresa_id` não passa a valer para o Prisma enquanto a conexão for o dono da tabela. Criar política sem trocar o papel só protege a API do Supabase, que já fica fechada por falta de política. Não é o primeiro ajuste. O que não pode acontecer é publicar a chave `service_role` ou a `DATABASE_URL` no navegador. O código não usa cliente Supabase no front: não há `createClient` nem `NEXT_PUBLIC` de banco.

### N+1, paginação e agregação

Páginas de lista não fazem N+1 clássico. Clientes trazem contagem de filiais e mensalidades num `include` só (`cliente-service.ts` 66–74 e 103–107). Envios da régua da tela de faturas são uma consulta (`regua-envios.ts` 13–27). O painel inicial usa `count`, `groupBy` e um `take: 5` (`painel-service.ts` 10–31).

O N+1 grande é o cron da régua: para cada fatura e cada passo, grava lembrete e, no WhatsApp, relê configuração Twilio, opt-out e template (`regua-job.ts` 99–234, `whatsapp-fila.ts` 119–146 e 243–256). Com 1.000 empresas isso é centenas de milhares de idas ao banco dentro de um pedido só.

Paginação:

- Clientes: o servidor manda a lista inteira. A tela corta de 20 em 20 no navegador (`clientes/page.tsx` 29, `tabela-clientes.tsx` 15 e 21–41). Com 200 clientes o HTML ainda é aceitável. Não há `take`.
- Faturas: `take: 200` (`fatura-service.ts` 165–183) e a página também fatia no cliente (`faturas-com-controles.tsx` 14). Quem tem mais de 200 faturas na situação filtrada não vê o resto e a tela não avisa. No topo da premissa (muitas em atraso ao mesmo tempo), isso esconde cobrança.
- Conversas do assessor: `take: 50` e, no detalhe, 200 mensagens. Adequado.
- Admin da plataforma: lista todas as empresas com contagem (`empresa-service.ts` 161–166). Em 1.000 linhas ainda é uma tabela só. Dá para deixar para depois.

Dashboards, por empresa, não por plataforma:

- **Boca de jacaré** agrupa no SQL, no máximo 12 meses, mais um total sem corte de data (`boca-jacare-service.ts` 77–97). Esse padrão presta.
- **Painel financeiro** traz as linhas de uma janela de 15 meses para o Node e monta os cartões em memória (`painel-financeiro.ts` 177–182, `painel-financeiro-service.ts` 65–92). Com cerca de 200 faturas por mês são uns poucos milhares de linhas. Segura.
- **MRR, churn e LTV** carregam todos os vínculos `MENSAL` da empresa e calculam 12 meses em memória (`metricas-service.ts` 8–34, `metricas-saas.ts` 65–67). Com centenas de vínculos, é instantâneo. O churn usa a data de ativação do cliente; não varre fatura.

View materializada **não** é necessária para chegar a 1.000 assinantes nesse formato (cada um olha só a própria empresa). Passa a fazer sentido se uma empresa acumular dezenas de milhares de faturas na janela do gráfico, ou se um dia existir um painel que some as 1.000 empresas de uma vez. O admin de hoje só conta clientes e usuários.

### Tamanho e conexões

**Estimativa** de disco no primeiro ano, no cenário alto (200 mil faturas/mês, 12 meses guardados, uns 4 eventos de webhook por fatura, lembrete e fila de WhatsApp na mesma ordem, índices):

- faturas: na casa de 3 a 8 GB com índice;
- eventos, lembretes, fila e mensagens do assessor: mais 5 a 15 GB;
- total folgado: **8 a 25 GB**. No cenário baixo (50 mil faturas/mês, pouco WhatsApp e pouco assessor), cabe perto dos **8 GB** inclusos no Supabase Pro.

Não há prazo de retenção para `eventos_asaas`, `lembretes_regua`, `fila_whatsapp`, `eventos_whatsapp` nem `mensagens_assessor`. O crescimento é contínuo.

Conexões (`src/server/db.ts`, linhas 17–21): na Vercel cada instância abre no máximo 1 conexão. A URL esperada é o pooler de transação, porta 6543, `pgbouncer=true` (o driver tira esse parâmetro em `src/server/url-pg.ts`). Isso está certo: a Function não segura um Postgres direto.

Limites públicos do Supabase por tamanho de compute (pooler na frente, Postgres atrás):

| Compute | RAM | Clientes no pooler | Conexões diretas no Postgres | Pool interno padrão |
| --- | --- | --- | --- | --- |
| Micro (incluso no crédito do Pro) | 1 GB | 200 | 60 | 15 |
| Small | 2 GB | 400 | 90 | 15 |
| Medium | 4 GB | 600 | 120 | 15 |
| Large | 8 GB | 800 | 160 | 20 |

O pool interno padrão (15) é o número de sessões reais no Postgres. O pooler segura centenas de clientes e só deixa 15 entrarem. Consulta curta, como a de uma página, convive com isso. O cron da régua segura a instância por minutos, mas cada query solta a sessão entre uma chamada HTTP e outra, porque não há uma transação única em volta do laço. O risco é outro: manhã de vencimento, com muitos webhooks ao mesmo tempo. A Vercel sobe muitas instâncias. No Micro, 200 clientes no pooler estouram. **Estimativa:** Small aguenta a rampa; Medium é o tamanho confortável perto de 1.000, pelo pooler e pelos 4 GB de RAM, não pelo disco.

O `next.config.ts` não fixa região. O padrão da Vercel é `iad1` (EUA). O banco de produção está em `sa-east-1`. Cada consulta atravessa o continente. Para o cron no limite de tempo e para o painel, a função deveria nascer em `gru1` (São Paulo).

## 2. Crons

Hoje, em `vercel.json`:

- `0 12 * * *` → `/api/cron/regua`
- `30 11 * * *` → `/api/cron/visualizacoes`

Os dois pedem `CRON_SECRET` em comparação de tempo constante (`src/server/cron/segredo.ts`). Sem o segredo, respondem 500. Isso está certo.

Não há cron de emissão de boleto. A mensalidade é assinatura no Asaas; a cobrança nova chega no webhook ou pela importação manual (`src/server/services/recorrencia-service.ts` e `fatura-service.ts` `importarFaturas`).

### Régua

`executarRegua` (`regua-job.ts` 66–243):

1. Lê toda `configuracao_regua` com `ativa: true`.
2. Para cada empresa, carrega todas as réguas, todas as faturas `PENDING`/`OVERDUE` (sem `take`) e o dono, se estiver em modo teste.
3. Para cada fatura e cada passo, decide se hoje é o dia (`passoCombina` em `src/lib/regua.ts` 157–168). No sábado e no domingo não envia, salvo régua que permita. Na segunda, manda também o que caiu no sábado e no domingo. A segunda é o pior dia.
4. E-mail sai na hora, um `POST` na Resend por lembrete.
5. WhatsApp só entra na fila.
6. No fim, `processarFilaWhatsapp` sem `empresaId` e sem `limite`, portanto **20 mensagens no total** (`whatsapp-fila.ts` 228–239).

Conta grosseira, **estimativa**, para ver a ordem de grandeza. Não é medição.

- 1.000 empresas com a régua ligada, 100 faturas em aberto, 10% batem um passo hoje: 10 mil e-mails.
- Um envio sequencial, entre banco e Resend, na casa de 200 a 400 ms: **30 a 70 minutos** só de e-mail.
- Se só 300 empresas estiverem com a régua ligada e 3 e-mails cada: ainda são cerca de **5 a 15 minutos**. O padrão de 300 segundos não cobre. O teto de 800 segundos cobre só o caso magro, e sem margem para a segunda-feira.

Se a função morre no meio:

- e-mail já gravado como `ENVIADO` não repete (índice único e a leitura em `envio.ts` 94–103);
- empresa que nem começou fica sem o lembrete daquele dia. O cron só volta no dia seguinte, e o passo só combina no dia certo (ou na segunda, para o fim de semana). **O lembrete perdido não é retomado;**
- não há cursor de empresa. O próximo dia recomeça na primeira.

Idempotência do e-mail é “consulta, envia, grava”. Se o processo cair depois do aceite da Resend e antes do `INSERT`, o dia seguinte manda de novo (`envio.ts` 106–151). O índice único não impede esse caso, porque o segundo envio ainda não vê a linha. Com um cron por dia o risco é baixo. Com vários trabalhadores em paralelo, duas empresas (ou dois lotes) podem passar da consulta juntas e mandar o e-mail duas vezes. Antes de paralelizar, é preciso reservar a linha (um estado “enviando”) **antes** do `POST`. O check de `lembretes_regua` hoje só aceita `ENVIADO`, `FALHOU` e `IGNORADO`.

`FALHOU` não é único. Falha tenta de novo no dia seguinte, o que é bom, e acumula linha, o que é só volume.

O backoff do WhatsApp (15 minutos, 3 tentativas, `whatsapp-fila.ts` 314–332) não funciona com cron diário: a mensagem só é olhada de novo no outro dia. A devolução de item preso em `PROCESSANDO` depois de 10 minutos (linhas 230–234) tem o mesmo problema.

### Visualizações

`sincronizarVisualizacoesAgendadas` (`visualizacao-fatura-service.ts` 173–197):

- toda empresa com Asaas, ordem `criadoEm` crescente;
- 40 faturas por empresa por dia (`LOTE_CRON`, linha 15);
- 4 GETs ao mesmo tempo, teto de 5 (linhas 12–13 e 47–49), abaixo dos 50 GETs simultâneos do Asaas;
- em 429 ou 401, para aquela empresa e segue para a próxima;
- `maxDuration = 60` na rota (`src/app/api/cron/visualizacoes/route.ts`, linha 8).

**Estimativa:** 40 pedidos com concorrência 4, a ~200 ms, são cerca de 2 segundos por empresa mais o banco. Em 60 segundos cabem na ordem de 20 a 30 empresas. São sempre as mais antigas. A empresa número 1000 não entra na fila. Não há “próxima empresa” gravada em lugar nenhum.

Quarenta faturas por dia também não alcançam uma empresa com 150 boletos em aberto não vistos. O webhook `PAYMENT_CHECKOUT_VIEWED` / `PAYMENT_BANK_SLIP_VIEWED` cobre quem abre depois que o webhook existe (`asaas-webhook-service.ts` 8–9 e 88–90). O cron é a rede de quem não gerou evento. Do jeito que está, essa rede não visita a maior parte das contas.

### Emissão e importação

Emissão avulsa e ativação de recorrência são ação do usuário, uma chamada ao Asaas por cobrança ou por assinatura, com chave de idempotência na fatura. Isso escala com o uso de cada empresa, não com um job global.

`importarFaturas` (`fatura-service.ts` 595–678) é o atalho quando o webhook falha: para **cada** cliente com id no Asaas e **cada** assinatura, até 5 páginas de 100 cobranças, em série, e depois um `espelhar` por cobrança. Não há `maxDuration` nessa rota (cai no padrão de 300 segundos). Uma empresa com 200 clientes no Asaas pode estourar o pedido e gravar só um pedaço, sem retomar de onde parou.

Não há job de reconciliação. Se o webhook cair por algumas horas, a fatura fica desatualizada até alguém clicar em Importar.

### O que colocar no lugar

Não dá para “otimizar o laço” e manter um pedido por dia. O desenho que cabe:

- cron curto, de poucos em poucos minutos (plano Pro);
- cada execução pega um lote de empresas ou de mensagens, grava o cursor e sai antes do teto;
- e-mail e WhatsApp em filas separadas, com reserva da linha antes da chamada externa;
- trabalhador que pode morrer e continuar: Vercel Workflow (pode pausar e retomar sem o teto da Function) ou Vercel Queues (entrega ao menos uma vez, com retry). Os dois servem. O ponto é o cursor e a idempotência, não a marca da fila;
- se o lote do dia não fechar, um alerta. Hoje o 504 se perde no log da Vercel.

Enquanto isso não existir, ligar a régua para dezenas de empresas já é roleta. Para 1.000, a régua não cumpre o horário.

## 3. Integrações

### Asaas

Limite publicado por **conta** (não da plataforma inteira). Cada assinante usa a própria chave, então 1.000 empresas são 1.000 cotas:

- até 25.000 requisições a cada 12 horas;
- até 50 GETs ao mesmo tempo;
- alguns endpoints têm limite próprio, visível nos cabeçalhos `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`. O código lê o reset em `cliente-http.ts` 162–166 e 220–228.

Para uma empresa de 200 clientes, a cota de 25 mil em 12 horas sobra, desde que ninguém faça polling. O cron de visualização, se um dia visitar todo mundo, gasta 40 a 200 GETs por empresa por dia. Ainda cabe na cota **daquela** conta. O que não cabe é o nosso pedido único.

O cliente HTTP não tenta de novo. Em 429, a visualização para a empresa e segue. Nas outras chamadas, o erro sobe. A documentação do Asaas pede para não repetir na hora. Falta uma fila com espera do `RateLimit-Reset`, não um retry cego.

Webhook `POST /api/webhooks/asaas`:

- autentica o cabeçalho `asaas-access-token` pelo hash SHA-256, com comparação de tempo constante (`asaas-cripto.ts` 59–67, `asaas-webhook-service.ts` 74–78). Não é HMAC do corpo; é o modelo do Asaas (token estático). O token nasce com 32 bytes (`gerarTokenWebhook`);
- grava `eventos_asaas` na mesma transação do espelho. Conflito na chave única vira `duplicado: true` (linhas 83–112). Segunda entrega não refaz o efeito;
- não declara `maxDuration`. Um evento é curto. O volume é que importa.

**Estimativa** de volume: 50 mil a 200 mil faturas/mês, 3 a 8 eventos cada (criada, alterada, vencida, recebida, visualizada). Dá **150 mil a 1,6 milhão de webhooks por mês**. Cada um é uma Function e uma transação. Isso a Vercel absorve. O aperto é o pico da manhã do vencimento contra o pooler pequeno, e o trabalho extra no mesmo pedido (enfileirar WhatsApp de “pago”). O webhook em si pode continuar fino: gravar o evento e deixar o resto para a fila.

### Twilio

O desenho é o de ISV: uma subconta e um Sender por empresa, token da subconta cifrado, conta pai só em `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` (`schema.prisma` 487–508, `twilio/http.ts` `criarSubconta`). Não há cron criando as 1.000 subcontas. Cada dono conecta a sua. A API aguenta criar subconta sob demanda. O que não escala sozinho:

- um WABA por subconta. Template UTILITY precisa ser aceito pela Meta. Isso é fila humana e de revisão, não um `POST` que volta pronto. A fila do Taguaro espera até 7 dias e depois ignora (`whatsapp-fila.ts` 18 e 273–284);
- número novo começa com limite de **250 destinatários únicos em 24 horas** fora da janela de atendimento, no portfólio da Meta. Sobe para 2.000, 10.000, 100.000 e ilimitado se a qualidade se mantiver e o volume usar pelo menos metade do teto. Uma empresa com 200 clientes em atraso no mesmo dia, no número novo, toma erro 63018. O código marca a mensagem como falha depois de 3 tentativas e não distingue “espere o limite diário” de “número inválido”;
- throughput do Sender é alto (padrão publicado de 80 mensagens por segundo). Não é o nosso gargalo. O gargalo é o `take: 20` diário;
- a conta pai paga as mensagens das subcontas, salvo contrato de repasse que não aparece no código. Com a régua em WhatsApp para uma fatia grande das faturas, **estimativa**: essa linha pode passar a soma de Vercel e Supabase. O preço unitário é o da Meta (categoria e país) e não está fixo aqui;
- o cliente HTTP não trata 429 nem faz backoff (`twilio/http.ts`). A fila tem 3 tentativas com 15 minutos, o que só vale quando o worker rodar o dia inteiro.

O webhook da Twilio valida a assinatura HMAC com o token da subconta e a URL gravada (`twilio-webhook-service.ts` 27–44, `lib/twilio-assinatura.ts`). Evento repetido esbarra no índice único. Isso está sólido. Falha do assessor no mesmo pedido é só logada (`twilio-webhook-service.ts` 111–120): a mensagem entra, a resposta da IA pode se perder sem retry.

### Resend

Cada empresa guarda a própria chave, cifrada com a mesma `ASAAS_ENCRYPTION_KEY` (`schema.prisma` 398–409). O `AUTH_RESEND_API_KEY` da plataforma só manda o e-mail de redefinir senha.

Limite publicado da Resend: **10 requisições por segundo por time**, em todos os planos. Subir de plano não sobe esse número. O lote oficial manda até 100 e-mails num pedido e conta como 1 requisição. O código manda um e-mail por `POST` (`src/server/regua/resend.ts` 34–61), sem timeout, sem ler `retry-after` e sem repetir. Como o envio é serial, 10 por segundo não é o primeiro teto. O primeiro teto é o cron de 300 segundos: na prática, **algumas centenas de e-mails por dia no sistema inteiro**, não milhares.

Cota de plano, **estimativa**, se um dia o envio for centralizado numa conta só da Taguaro:

- 10 mil e-mails/dia úteis × ~22 dias ≈ 200 mil e-mails/mês. Plano Scale publicado em torno de US$ 160/mês para 200 mil, excedente em torno de US$ 0,80 por mil;
- no cenário de 10 mil e-mails num único dia de segunda-feira, a conta é a mesma ordem.

Se cada assinante trouxer a própria chave e o próprio domínio verificado, a conta da Taguaro quase não paga régua. Operar isso com 1.000 pequenas empresas (domínio, DNS, chave, modo teste) é projeto de implantação, não de código. O modo teste já existe e começa ligado (`schema.prisma` 405), o que evita disparo acidental. Bom.

Não há chave de idempotência no pedido da Resend. Ver a reserva da linha na seção dos crons.

## 4. Multi-empresa e segurança

O que está bem feito:

- dado de uma empresa não entra na consulta da outra nos serviços lidos para esta revisão. A página e a API usam `carregarAcesso`, que relê o usuário e a empresa e recusa conta suspensa (`acesso.ts` 18–38);
- o cookie é `httpOnly`, `sameSite=lax`, `secure` em produção, 7 dias (`sessao.ts` 12–21, `token.ts` 36). Troca de senha sobe `versaoSessao` e invalida o cookie antigo na hora de carregar o acesso. O middleware, porém, só olha o JWT (`middleware.ts` 38–41). Um papel rebaixado pode passar da borda por até 7 dias; a página e a API, que leem o banco, é que barram. Não vaza empresa, mas a borda fica frouxa;
- webhook do Asaas acha a empresa pelo hash do token, não por id no corpo;
- webhook da Twilio acha a empresa pelo SID da subconta e confere a assinatura;
- cartão: só bandeira e quatro últimos. Não há PAN nem CVV no schema;
- logs do Asaas redactam chave `$aact_` e sequências de 13 a 19 dígitos (`asaas/log.ts`).

Onde o isolamento pode falhar, sem ser um furo aberto hoje:

- qualquer serviço novo que filtre só por `id` (cuid) e esqueça `empresaId` lê a linha. O RLS não segura, porque a conexão é o dono. Os gatilhos seguram a escrita cruzada nas tabelas que os têm. `filiais` não tem `empresa_id`: a checagem é `cliente: { empresaId }` no serviço (`filial-service.ts` 29–36). Não há gatilho equivalente;
- superadministrador lista empresas e suspende conta. Não lista clientes das outras. O flag está no usuário, não num papel à parte (`schema.prisma` 144);
- `ASAAS_ENCRYPTION_KEY` é uma chave AES-256-GCM só, em variável de ambiente (`lib/asaas-cripto.ts` 10–35). Ela cifra, para todas as empresas, a chave de API do Asaas, o token do webhook, a chave da Resend e o auth token da subconta Twilio. IV aleatório e tag de autenticação estão corretos. Quem leva o banco **e** essa variável abre todas as contas externas. Quem perde a variável não lê mais nenhum segredo já gravado. O `.env.example` (linhas 35–38) e o README já dizem para não trocar a chave se houver segredo gravado. **Esta revisão não propõe rotação.** O que falta é cópia da chave fora da Vercel (cofre), porque perda é irreversível, e tratar a variável como segredo de produção, diferente em homologação.

Não foi feita varredura de penetração. O julgamento acima é o do código.

## 5. Frontend e servidor

O layout do painel é `force-dynamic` (`src/app/(painel)/layout.tsx`, linha 5). Toda página autenticada bate no banco. Para dado de cobrança, cache de página compartilhado seria o bug errado. Não há `unstable_cache`.

O custo real é o tamanho da resposta:

- `/clientes` serializa todos os clientes da empresa no HTML e o componente pagina no browser;
- `/faturas` serializa até 200 faturas, com régua e envios, e também pagina no browser;
- financeiro e métricas calculam no servidor e mandam o resumo. A boca de jacaré vem em `Suspense`, separada do resto do painel (`dashboards/financeiro/page.tsx` 60–66). Esse pedaço está bem.

Com 200 clientes a página ainda abre. O problema aparece junto com o corte silencioso das faturas e com o tempo de banco se a região da função continuar nos EUA.

Bundle: `recharts` entra nas telas de gráfico (`grafico-boca-jacare.tsx` e métricas), não no layout. `lucide-react` já está em `optimizePackageImports` (`next.config.ts` 8). Não é o que limita 1.000 assinantes. Import dinâmico do gráfico é polimento.

O assessor, se ligado, chama o AI Gateway no webhook, com teto padrão de 600 tokens por resposta e **100.000 tokens por empresa por dia** (`assessor-service.ts` 96–97). Mil empresas no teto são um custo de modelo à parte, bem maior do que a hospedagem. O teto por telefone (8 a cada 10 minutos) e por empresa (60 a cada 10 minutos) segura abuso, não a conta no fim do mês.

## 6. Observabilidade, backup, homologação, planos e custo

### Observabilidade

Não há Sentry, OpenTelemetry nem dreno de log no repositório. Erro inesperado vai para `console.error` (`src/server/http.ts` 30). Cron bem-sucedido devolve JSON e ninguém guarda a série “empresas processadas / faltaram”. No plano Pro do Supabase a retenção de log do projeto é de 7 dias. Log da Vercel depende do plano e não acorda ninguém.

Sem isso, a falha dos crons fica invisível: a tela do assinante simplesmente não recebe o lembrete.

Mínimo útil, antes de crescer: um registro por execução (começou, lote, cursor, terminou, erro) e um aviso quando a régua do dia não fechar ou quando 429 passar de um limiar. Dreno de log (add-on do Supabase, cerca de US$ 60 por dreno por mês, mais uso) ou um serviço de erro. Os dois são **estimativa** de ferramenta, não de obrigação de marca.

### Backups

Não há configuração de backup no repositório. No Supabase Pro, o incluso é backup diário por 7 dias. Point-in-time recovery é add-on: cerca de US$ 100 por mês para 7 dias, exige compute no mínimo Small, e substitui o backup diário. Para cobrança, perder um dia de webhook e de lembrete dói. PITR de 7 dias é o patamar recomendado em produção. Restaurar continua sendo ação manual no painel; vale um ensaio numa cópia.

### Homologação

O README aponta um projeto de produção: `ziqjcworupopkcnfddjr`, região `sa-east-1`. Não há segundo projeto no código. Teste automatizado usa o Postgres local `gestaocobranca_test`. O Asaas sandbox é por empresa (`AmbienteAsaas`), o que serve para um assinante testar a própria chave. Não substitui um ambiente da plataforma.

O README ainda diz para colocar as variáveis de Preview na Vercel “se ele apontar para um banco”. Preview de pull request contra o banco de produção é o jeito mais fácil de misturar dado de teste com cobrança real. Homologação precisa de outro projeto Supabase, outra `ASAAS_ENCRYPTION_KEY`, `CRON_SECRET` e chaves Twilio/Resend de teste, e o Preview não pode usar a `DATABASE_URL` de produção.

### Planos

- **Vercel Hobby não serve** para esta meta. Cron só uma vez por dia, e mesmo o Pro, com cron de um em um minuto e função de até 800 segundos, só resolve se o trabalho for fatiado. Preço publicado: US$ 20 por mês, com US$ 20 de crédito de uso. Functions: CPU ativa a partir de cerca de US$ 0,128 por hora, memória provisionada a partir de cerca de US$ 0,0106 por GB-hora, invocação a partir de cerca de US$ 0,60 por milhão depois da franquia.
- **Supabase Pro** é o mínimo: US$ 25 por mês, 8 GB de disco, backup de 7 dias, projeto que não pausa. O crédito de compute de US$ 10 cobre um Micro. Micro (1 GB, 200 clientes no pooler) fica curto no pico de webhook e no disco do cenário alto. Small (~US$ 15) na rampa, Medium (~US$ 60) perto de 1.000.

### Custo mensal de infraestrutura em 1.000 assinantes

**Estimativa**, preços públicos de novembro de 2026, sem imposto, sem boleto do Asaas (cada assinante paga a própria conta Asaas) e sem negociar desconto.

| Linha | Baixo (régua contida, pouco WhatsApp, assessor quase desligado) | Alto (régua e WhatsApp no grosso das faturas, assessor em muitas empresas) |
| --- | --- | --- |
| Vercel Pro + uso de Functions | US$ 20 a 50 | US$ 50 a 200, se os workers forem curtos. Cron longo e ocioso em memória sobe isso |
| Supabase Pro + Medium + PITR 7 dias | ~US$ 175 (25 + 60 − 10 de crédito + 100) | igual, mais disco acima de 8 GB a US$ 0,125/GB. **Estimativa** de excedente US$ 0 a 15 no primeiro ano |
| Projeto de homologação, compute Small | ~US$ 15 | ~US$ 15 |
| Resend da plataforma | ~US$ 0 a 20 se a chave for de cada empresa (só o e-mail de senha) | US$ 160 a 350 se a Taguaro centralizar 200 mil a 500 mil e-mails/mês |
| Twilio / Meta | baixo se quase ninguém conectar WhatsApp | variável, e pode ser a maior linha. A conta pai paga. Não há preço unitário no código |
| AI Gateway do assessor | perto de zero | sem teto de dinheiro no código; o teto é 100 mil tokens/dia por empresa |

**Piso de hospedagem, estimativa: US$ 220 a 450 por mês**, com Pro nos dois lados, compute Medium, PITR e uma homologação pequena. WhatsApp em escala e assessor ligado em massa ficam **fora** desse piso e precisam de teto comercial antes de ligar para todo mundo.

Não é um número para colocar em proposta sem medir um mês real de uma dezena de empresas com a régua ligada.

## Ajustes, em ordem

Esforço: **P** cabe num trecho localizado, **M** mexe num fluxo, **G** troca o jeito de processar o dia ou a operação.

### Crítico

| Ajuste | Esforço | Se não fizer |
| --- | --- | --- |
| Fatiar a régua: lote de empresas, cursor gravado, várias vezes por hora, parar antes do teto da Function. Reservar o lembrete antes de chamar a Resend. | G | Com dezenas de réguas ligadas o dia já falha no meio. Em 1.000, a maior parte dos lembretes não sai, e o do dia seguinte não recupera o que passou. |
| Tirar o WhatsApp do `take: 20` diário. Worker contínuo, lote por execução, backoff de 15 minutos que realmente rode, separar “limite diário da Meta” de falha definitiva. | G | A fila só cresce. O assinante acha que a régua de WhatsApp funciona. |
| Visualização com cursor de empresa e de fatura, lote que caiba em menos de 60 segundos, ou o mesmo worker da régua. Não recomeçar sempre da empresa mais antiga. | M | Quase nenhuma empresa depois das primeiras tem boleto marcado como visto, fora o que o webhook pegar. |
| Registrar cada execução e avisar se o dia não fechou (empresas restantes, 504, 429). | P | A falha fica muda. O suporte só descobre pelo cliente. |

### Importante

| Ajuste | Esforço | Se não fizer |
| --- | --- | --- |
| Índice `(empresa_id, vencimento)` em faturas e `(empresa_id, whatsapp)` em clientes. Índice parcial para “não visualizada”. | P | Consulta de uma empresa ainda aguenta centenas de faturas. Com anos de histórico e pico de webhook, a varredura da empresa (e a busca de telefone sem índice) aparece no tempo de resposta. |
| Paginação no servidor para faturas, com aviso se o filtro tiver mais do que a página. Não cortar em 200 calado. | M | Cobrança em aberto some da tela quando passa de 200. |
| Reconciliação do Asaas por empresa, em lote, respeitando a cota de 25 mil/12 h. A importação manual não pode ser o único reparo, nem varrer 200 clientes num pedido de 300 segundos. | M | Webhook perdido deixa status velho até alguém clicar em Importar, e esse clique pode estourar. |
| Tratar 429 do Asaas e da Resend com a espera que o cabeçalho manda, numa fila. Timeout no `fetch` da Resend. | M | Um limite derruba o lote inteiro ou, na Resend, deixa o pedido pendurado até a Function morrer. |
| Subir o compute do Supabase (Small na rampa, Medium antes de 1.000) e conferir o pool interno. Função em `gru1`, junto do banco. | P | Pico de webhook toma erro de conexão. Painel e cron pagam a latência EUA–São Paulo. |
| PITR de 7 dias e um ensaio de restauração. | P | Um acidente de escrita perde até um dia de cobrança e de lembrete. O backup diário do Pro não volta no meio do dia. |
| Projeto Supabase de homologação. Preview da Vercel sem `DATABASE_URL` de produção. Outra `ASAAS_ENCRYPTION_KEY`. | M | Teste de pull request mexe em cliente e boleto reais. |
| Cópia da `ASAAS_ENCRYPTION_KEY` num cofre fora da Vercel. Não rotacionar. | P | Perder a variável apaga, na prática, o acesso a Asaas, Resend e Twilio de todas as empresas. |
| Retenção: apagar ou arquivar evento de webhook, lembrete e mensagem antiga (por exemplo, depois de 12 a 24 meses). | M | O disco passa dos 8 GB inclusos e o backup fica mais lento. **Estimativa** de um a dois anos no cenário alto. |
| Teto de gasto do assessor (dinheiro ou tokens globais), não só 100 mil tokens por empresa. | M | Várias empresas com o assessor ligado custam mais do que a hospedagem, sem alarme. |
| Decidir quem paga Resend e Twilio: chave de cada empresa ou conta da plataforma, e colocar isso no preço do plano. | G | Ou a implantação de 1.000 domínios não anda, ou a conta pai da Twilio chega sem o repasse estar combinado. |

### Bom ter

| Ajuste | Esforço | Se não fizer |
| --- | --- | --- |
| Trocar índices globais de nome, cidade, status e segmento por compostos com `empresa_id`. | P | Escrita um pouco mais cara e plano de consulta menos previsível. Não trava a meta. |
| `pg_trgm` na busca por nome, se alguma empresa crescer muito além de 200 clientes. | P | A busca continua varrendo a empresa. Em 200 nomes, nem se nota. |
| Lista de clientes paginada no servidor. | M | Com 200 clientes a página segue utilizável. Fica pesada se alguém cadastrar milhares. |
| View materializada de MRR ou da boca de jacaré, por empresa. | M | Desperdício agora. Os números de uma empresa de 200 clientes já saem rápido. |
| Import dinâmico do `recharts`. | P | O gráfico pesa o JS de quem abre o dashboard, não o de quem só vê clientes. |
| Middleware reler papel e `versaoSessao` no banco, ou aceitar que a barreira é a página. | M | Papel velho no cookie atravessa a borda por até 7 dias. A API já confere. |
| Limpar `limites_cadastro` e `limites_assessor` fora da janela. | P | Tabelas de contagem crescem devagar. |

## Plano em fases

### Fase 1. Antes de ligar a régua para mais do que um punhado de empresas

O bloqueio da meta está aqui. Sem isso, o resto é detalhe.

1. Cron da régua e do WhatsApp em lotes curtos, várias vezes por hora, com cursor e reserva da mensagem antes do envio externo.
2. O mesmo para visualização, para não privilegiar as empresas antigas.
3. Log da execução e alerta se sobrar empresa ou se a função estourar.
4. Função na região de São Paulo. Compute do banco pelo menos Small enquanto a fila nova entra em produção.

Não aumentar só o `maxDuration`. Trezentos segundos a mais não cabem 1.000 empresas e escondem o problema por um tempo.

### Fase 2. Na rampa, dezenas a poucas centenas de assinantes

1. Índices de vencimento e de WhatsApp.
2. Faturas paginadas no servidor, sem corte mudo.
3. Reconciliação do Asaas em fila, com a cota por conta.
4. Espera de 429 para Asaas e Resend.
5. Homologação separada. Preview longe do banco real.
6. PITR e ensaio de restore. Cópia da chave de cifragem no cofre.
7. Medir um mês real: e-mails, mensagens WhatsApp, webhooks, tempo do lote, conexões no pooler. Ajustar a estimativa de custo com esse número.

### Fase 3. Caminho até 1.000

1. Worker durável (Workflow ou Queues) por empresa, idempotente, com retry e painel do que falhou.
2. Retenção de evento, lembrete e conversa.
3. Compute Medium se o pooler ou a RAM pedirem. Disco acima de 8 GB entra na conta, barato perto do compute.
4. Operação Twilio: onboarding do WABA, limite de 250, modelo de quem paga a mensagem.
5. Modelo de e-mail (chave do cliente ou conta única) fechado no comercial.
6. Teto de custo do assessor.
7. View materializada só se a medição da fase 2 mostrar gráfico lento. Não antecipar.

## O que esta revisão não fez

- Não alterou código de produção, schema, migration nem variável de ambiente.
- Não leu o banco `ziqjcworupopkcnfddjr` e não chamou Asaas, Twilio, Resend nem a API da Vercel de um jeito que grave dado.
- Não mediu tempo real de cron nem tamanho real das tabelas. As contas de minuto, gigabyte e dólar são estimativas para decidir a ordem, não para contrato.
- Não desenhou o texto da fila. O próximo passo de implementação é a fase 1, num pull request separado.
