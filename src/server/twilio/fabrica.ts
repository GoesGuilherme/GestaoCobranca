import { ErroAplicacao } from "@/server/erros";
import type { ClienteTwilio } from "./contrato";
import { afirmarHttpTwilioPermitido, criarClienteTwilioHttp } from "./http";
import { criarClienteTwilioMemoria } from "./memoria";

type AmbienteTwilio = {
  NODE_ENV?: string;
  TWILIO_MOCK?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WEBHOOK_URL?: string;
  TWILIO_WHATSAPP_TESTE?: string;
};

export function credenciaisPaiTwilio(env: AmbienteTwilio = process.env) {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || authToken.length < 16) {
    throw new ErroAplicacao(
      "Defina TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN no servidor. Eles não são digitados na tela.",
      500,
      "twilio_sem_credencial",
    );
  }
  return { accountSid, authToken };
}

export function urlWebhookTwilio(env: AmbienteTwilio = process.env) {
  const bruto = env.TWILIO_WEBHOOK_URL?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new ErroAplicacao(
      "Defina TWILIO_WEBHOOK_URL com o endereço público de /api/webhooks/twilio.",
      500,
      "twilio_sem_webhook",
    );
  }
  if (url.pathname !== "/api/webhooks/twilio") {
    throw new ErroAplicacao("TWILIO_WEBHOOK_URL precisa terminar em /api/webhooks/twilio.", 500, "twilio_sem_webhook");
  }
  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new ErroAplicacao("Em produção o webhook da Twilio precisa ser https.", 500, "twilio_sem_webhook");
  }
  return bruto;
}

export function numeroTesteWhatsapp(env: AmbienteTwilio = process.env): string | null {
  const bruto = env.TWILIO_WHATSAPP_TESTE?.trim() ?? "";
  if (!bruto) return null;
  return bruto;
}

export function clienteTwilioPadrao(env: AmbienteTwilio = process.env): ClienteTwilio {
  if (env.TWILIO_MOCK === "true" && env.NODE_ENV === "production") {
    throw new ErroAplicacao("TWILIO_MOCK não pode ficar ligado em produção.", 500, "twilio_mock_proibido");
  }
  if (env.NODE_ENV !== "production") return criarClienteTwilioMemoria();
  afirmarHttpTwilioPermitido(env);
  return criarClienteTwilioHttp({ env });
}
