# Promessa de pagamento no WhatsApp

Estes modelos são uma proposta. Eles não foram enviados à Twilio nem à Meta, e nenhuma mensagem saiu daqui.

O botão pedido é **Quero registrar uma promessa de pagamento** (43 caracteres). A Meta limita o título de um quick reply a 20 caracteres, então o título pronto para submissão é **Registrar promessa** (19). A frase completa fica no corpo. O link da cobrança continua no texto, ao lado do botão. O payload do botão é a variável do token opaco (`pp1_` + 43 caracteres). Esse token não é o id da fatura.

O aviso de pagamento (`PAGO`) não leva o botão: a cobrança já foi paga.

Nada disso entra na publicação automática. Os modelos em uso continuam `taguaro_*_v2` e `taguaro_vence_hoje`.

## taguaro_boleto_gerado_v3

Categoria: UTILITY. Idioma: pt_BR.

Corpo:

> Olá, {{1}}. Seu boleto de {{2}}, com vencimento em {{3}}, foi gerado. Acesse sua fatura: {{4}}. Para registrar uma promessa de pagamento, toque no botão. Qualquer dúvida, responda esta mensagem.

Botão quick reply: `Registrar promessa`, id `{{5}}`.

Exemplo: 1 Maria Exemplo, 2 R$ 150,00, 3 30/10/2026, 4 https://www.asaas.com/i/exemplo, 5 um token `pp1_` de exemplo.

## taguaro_vence_em_dias_v3

Corpo:

> Olá, {{1}}. Sua cobrança de {{2}} vence em {{3}} dias, na data {{4}}. Acesse sua fatura: {{5}}. Para registrar uma promessa de pagamento, toque no botão. Qualquer dúvida, responda esta mensagem.

Botão: `Registrar promessa`, id `{{6}}`.

## taguaro_vence_hoje_v3

Corpo:

> Olá, {{1}}. Sua cobrança de {{2}} vence hoje, na data {{3}}. Acesse sua fatura: {{4}}. Para registrar uma promessa de pagamento, toque no botão. Qualquer dúvida, responda esta mensagem.

Botão: `Registrar promessa`, id `{{5}}`.

## taguaro_venceu_v3

Corpo:

> Olá, {{1}}. A cobrança de {{2}}, com vencimento em {{3}}, está em atraso. Acesse sua fatura: {{4}}. Para registrar uma promessa de pagamento, toque no botão. Qualquer dúvida, responda esta mensagem.

Botão: `Registrar promessa`, id `{{5}}`.

## Dentro da janela de 24 horas

O toque no botão abre a sessão. A resposta é texto livre, sem modelo novo:

> Quando você pretende pagar a cobrança de R$ X?
>
> Responda com uma destas opções:
> Amanhã
> Em 3 dias
> Em 7 dias
> Outra data

`Outra data` pede `dd/mm` ou `dd/mm/aaaa`. A confirmação é `Anotado: pagamento de R$ X até dd/mm`.

A fonte destes textos é `src/lib/whatsapp-promessa.ts`.
