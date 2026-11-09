# Cora no Taguaro (Parceria, Stage)

A Cora entra na mesma camada de provedor do Asaas e do Inter. Esta entrega é a modalidade **Parceria Cora**, não Integração Direta: não há certificado mTLS. A autenticação é OAuth 2.

O padrão é o ambiente de testes (Stage), `https://api.stage.cora.com.br`. A URL de produção `https://api.cora.com.br` existe no código e só é usada se `CORA_AMBIENTE=producao`. Sem essa flag, mesmo um `CORA_API_BASE` apontando para produção é ignorado.

Empresas no Asaas ou no Inter não passam por este conector até alguém escolher a Cora na tela Banco.

## Variáveis de ambiente

Defina no Preview (não commite valores):

| Nome | Função |
| --- | --- |
| `CORA_CLIENT_ID` | Client ID da parceria |
| `CORA_CLIENT_SECRET` | Client secret da parceria |
| `CORA_REDIRECT_URI` | URI de retorno. O padrão é `https://gestao-cobranca-beta.vercel.app/api/integracoes/cora/callback` e precisa ser idêntico ao cadastrado na Cora |
| `CORA_API_BASE` | Opcional. Vazio ou a URL de Stage |
| `CORA_AMBIENTE` | `stage` (padrão) ou `producao` |
| `CORA_WEBHOOK_SEGREDO` | 20 a 80 caracteres (`openssl rand -hex 24`). Entra no caminho do webhook |
| `PAGAMENTOS_ENCRYPTION_KEY` | Já usada pelo Inter. Cifra access token e refresh token |
| `PAGAMENTOS_PUBLIC_URL` | Origem HTTPS. Se vazia, o webhook usa a origem da redirect URI |

O client id e o client secret da parceria autenticam o Taguaro (`client_credentials`) só para cadastrar webhooks. Cada empresa autoriza a própria conta com Authorization Code. O escopo pedido é só `invoice`.

## Como a empresa conecta

1. O dono abre Configurações → Banco.
2. Em Cora, clica em Conectar conta Cora.
3. O Taguaro manda um `state` aleatório, gravado só como hash e preso à empresa e ao usuário da sessão, num cookie assinado.
4. A Cora devolve o navegador para `/api/integracoes/cora/callback` com `code` e `state`.
5. O callback exige a mesma sessão, confere o state e troca o código por tokens. Access e refresh ficam cifrados em `configuracoes_pagamento`.
6. A empresa passa a emitir as cobranças novas pela Cora. Asaas e Inter não são apagados.
7. Desconectar apaga os tokens e, se a Cora era o provedor ativo, as cobranças novas voltam para o Asaas.

O access token dura cerca de 24 horas. O Taguaro renova com o refresh token e grava o par novo. Se a Cora invalidar a sessão, a tela pede para conectar de novo.

## Boleto

Emissão em `POST /v2/invoices`, com `Idempotency-Key` (UUID) gravado em `faturas.idempotency_key_cora` antes da chamada. Um retry da mesma fatura reenvia a mesma chave. O boleto sai com Pix (`BANK_SLIP` e `PIX`) quando a conta Cora tem chave Pix. Cancelamento é `DELETE /v2/invoices/{id}`. Consulta é `GET /v2/invoices/{id}`.

Status: `OPEN` pendente, `LATE` vencido, `PAID` pago, `CANCELLED`/`CANCELED` cancelado, `DRAFT` criando. A Cora não tem assinatura nativa: a mensalidade continua no cron do Taguaro, como no Inter. A API de fatura usada aqui não edita boleto já emitido.

## Webhook

Cadastro com o token de `client_credentials`, recurso `invoice`, gatilhos `paid`, `canceled`, `overdue` e `created`.

O POST da Cora traz os cabeçalhos `webhook-event-id`, `webhook-event-type` e `webhook-resource-id`, user-agent `Cora-Webhook` e corpo vazio. Não há assinatura confiável. A rota exige o segredo no caminho, o user-agent e o limite de chamadas. O aviso repetido (mesmo event id) não é aplicado de novo.

A fatura **não** é marcada paga nem cancelada pelo cabeçalho. O Taguaro relê a invoice com o access token da empresa dona da cobrança e só então grava o status que a API devolveu.

## Como testar

Os testes stubam o HTTP. Não chamam o Stage e não embutem segredo. Com as variáveis no Preview, o dono conecta pela tela Banco e emite um boleto de teste (mínimo R$ 5,00) para um cliente com endereço completo. O pagamento simulado no Stage deve chegar no webhook; a fatura só muda depois da releitura.
