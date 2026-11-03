# Banco Inter no Taguaro

O Inter entra como provedor da empresa, na mesma camada do Asaas. A cobrança é a API Cobrança v3 (boleto com Pix). A v2 foi descontinuada. O Inter não tem assinatura: a mensalidade nasce no cron do Taguaro.

Empresas que ficam no Asaas não usam este conector. A chave `ASAAS_ENCRYPTION_KEY` continua só para o Asaas, a Resend e a Twilio. Credencial do Inter usa `PAGAMENTOS_ENCRYPTION_KEY`.

## O que a empresa faz no Internet Banking

Quem cria a integração é o usuário Master da conta PJ.

1. Entrar no Internet Banking do Inter com o usuário Master.
2. Abrir Soluções para a sua empresa e criar uma nova integração (aplicação).
3. Marcar as permissões de cobrança: `boleto-cobranca.read` e `boleto-cobranca.write`. Sem esses escopos o Taguaro não emite nem consulta.
4. Na tela da integração, copiar o client id e o client secret.
5. Baixar o certificado (`.crt`) e a chave privada (`.key`). O Inter emite esse par. A validade é de cerca de um ano. Renovar é gerar outra integração e enviar o par novo. Não dá para só trocar a data.
6. Anotar a conta corrente que a aplicação enxerga, só com números, com o dígito e sem zeros à esquerda. O Taguaro envia esse valor no cabeçalho `x-conta-corrente`.
7. Sandbox e produção são integrações diferentes, cada uma com o próprio certificado. No Taguaro, o ambiente escolhido na tela tem que ser o mesmo da integração.

O certificado e a chave não voltam para a tela depois de salvos. Eles ficam cifrados em `configuracoes_pagamento`.

## Como ativar no Taguaro

1. Definir no servidor `PAGAMENTOS_ENCRYPTION_KEY` (32 bytes em base64, `openssl rand -base64 32`). É uma chave nova. Não copie a `ASAAS_ENCRYPTION_KEY`.
2. Definir `PAGAMENTOS_PUBLIC_URL` com a origem HTTPS da aplicação, por exemplo `https://app.taguaro.com.br`. Sem isso as credenciais são gravadas, mas o webhook não é cadastrado no Inter.
3. Entrar como dono da empresa, abrir Configurações → Banco.
4. Escolher sandbox ou produção, informar client id, client secret e conta corrente, e enviar o `.crt` e o `.key`.
5. Salvar. A empresa passa a emitir as cobranças novas pelo Inter. O Asaas dela não é apagado.
6. Clicar em Testar conexão. A prova é obter o token com o certificado e ler uma página de cobranças.
7. No cadastro de cada cliente, preencher endereço, bairro e CEP. O Inter recusa boleto sem o pagador completo.
8. A tela avisa quando o certificado vence em até 30 dias, ou quando já venceu.

Multa, juros e desconto continuam nas preferências de cobrança. O boleto do Inter sai sempre com Pix junto. Cartão não entra por esta API.

Para voltar, o dono usa "Voltar a usar o Asaas nas cobranças novas". As credenciais do Inter ficam guardadas.

## O que o Taguaro faz sozinho

- Emite, consulta, cancela e altera valor do boleto. A emissão é idempotente pelo `seuNumero` (no máximo 15 caracteres, derivado da chave da fatura).
- Guarda linha digitável, código de barras e Pix copia-e-cola. O PDF sai em `/api/faturas/{id}/pdf` quando a API devolve o arquivo.
- O webhook é `POST /api/webhooks/inter/{segredo}`. O segredo identifica a empresa. O corpo do Inter não é assinado de um jeito que a Vercel consiga checar (o banco espera mTLS na entrada). Por isso o Taguaro consulta a cobrança na API antes de marcar paga, cancelada ou expirada. Se a consulta falha, a rota responde 503 para o Inter tentar de novo.
- Todo dia, `/api/cron/recorrencias` (11:00 UTC) gera a cobrança do mês das vendas mensais de empresas no Inter. O Asaas continua na assinatura dele e esse cron não mexe nele.
- Todo dia, `/api/cron/conciliacao` (13:00 UTC) relê as cobranças do Inter ainda em aberto. É a rede se o webhook não chegar.

Os dois crons usam o mesmo `CRON_SECRET` das outras rotas.
