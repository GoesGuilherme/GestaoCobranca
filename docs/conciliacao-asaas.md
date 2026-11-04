# Conciliação diária com o Asaas

O webhook `POST /api/webhooks/asaas` continua sendo o caminho na hora. Se a fila do Asaas parar (por exemplo depois de vários `401` com a mensagem "Token do webhook recusado"), a cobrança paga lá fica `PENDING` aqui, com `pago_em` nulo.

## Quando roda

Não há cron novo. O projeto já agenda quatro rotinas diárias em `vercel.json` (`regua`, `visualizacoes`, `recorrencias`, `conciliacao`). No plano Hobby da Vercel cada cron roda no máximo uma vez por dia e a quantidade de crons é limitada, então a conciliação do Asaas entrou na rota que já existia:

- `GET` ou `POST /api/cron/conciliacao`
- todo dia às 13:00 UTC
- o mesmo `CRON_SECRET` das outras rotas (`Authorization: Bearer` ou `x-cron-secret`)

A resposta continua com os números do Inter na raiz (`empresas`, `consultadas`, `atualizadas`, `falhas`) e acrescenta `asaas` com o resumo do Asaas. Nenhuma variável nova. Não defina `ASAAS_MOCK` na Vercel e não troque `ASAAS_ENCRYPTION_KEY`.

O dono também pode disparar a mesma conciliação da empresa no botão **Atualizar**, na tela Faturas. Esse clique faz as duas leituras que antes estavam separadas: status da cobrança e visualização da fatura ou do boleto. O botão antigo "Atualizar visualizações" saiu.

## O que uma execução lê

Para cada empresa ativa com Asaas configurado, isolada das outras:

1. Cobranças em aberto no Taguaro (`PENDING` ou `OVERDUE`, ou o status normalizado pendente/vencido), não excluídas, com `asaas_payment_id`. A rotina pede `GET /v3/payments/{id}` de um lote por dia (as mais antigas primeiro; o dia seguinte segue o próximo lote).
2. Cobranças pagas nos últimos 14 dias (`RECEIVED`, `CONFIRMED`, `RECEIVED_IN_CASH`, com `paymentDate[ge]`), estornadas no mesmo intervalo, uma página de `REFUNDED` e cobranças criadas nos últimos 14 dias (`dateCreated[ge]`).
3. Faturas locais já pagas com `pago_em` nesses 14 dias, para pegar estorno que o webhook perdeu.

A lista usa no máximo 100 itens por chamada e poucas páginas. Entre páginas há uma pausa. `429` ou `401` interrompe só aquela empresa; as outras seguem. O log `[asaas] conciliacao` traz a contagem, sem chave, sem token e sem corpo de cobrança.

## O que muda na fatura

O estado passa pela mesma função do webhook (`aplicarPagamentoAsaas`):

| No Asaas | No Taguaro |
| --- | --- |
| `RECEIVED`, `CONFIRMED`, `RECEIVED_IN_CASH` | status de pago e `pago_em` = `clientPaymentDate`, senão `paymentDate`, senão `confirmedDate` |
| `OVERDUE` | vencida |
| `deleted: true` | `excluida` |
| `REFUNDED` (e os status de estorno) | estornada e `pago_em` nulo |

Se o status, a exclusão e a data já batem, a rotina não grava de novo. Uma segunda execução não duplica a fatura nem a mensagem.

Painéis, régua e promessa leem a fatura. Não há emissão de NFS-e neste repositório: nada disso dispara nota.

## O que é enviado ao cliente

Só o que o webhook já enviaria numa transição para paga:

- Entra na fila o WhatsApp do template **pago**, uma vez por fatura (a chave `wa:{empresa}:{fatura}:pago:PAGO` segura a repetição).
- Com o modo teste da régua ligado (o padrão), esse WhatsApp vai para o número de teste, ou fica ignorado se o WhatsApp não estiver conectado. Não é uma mensagem a mais.
- Não sai e-mail por causa da conciliação. A régua deixa de cobrar a fatura no dia seguinte porque ela saiu de pendente ou vencida. E-mail de cobrança já marcado na fila não é apagado.
- Estorno, atraso e exclusão não enfileiram WhatsApp.

A visualização diária continua em `/api/cron/visualizacoes` (11:30 UTC) e também no mesmo botão, depois da conciliação. Ela só grava que o pagador abriu a fatura ou o boleto. Não manda mensagem.

## 401 do webhook

Token ausente ou que não confere com o hash guardado responde 401, como antes, e registra `[asaas] webhook_recusado` com `motivo` `ausente` ou `nao_confere` e o id do evento, quando ele veio no JSON. O token, o hash e a chave da API não entram no log.
