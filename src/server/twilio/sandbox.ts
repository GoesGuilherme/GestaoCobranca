import { TIPOS_TEMPLATE_WHATSAPP, type TipoTemplateWhatsapp } from "@/lib/whatsapp-cobranca";

// Remetente fixo do WhatsApp Sandbox da Twilio. Não aceitamos outro From
// com a credencial da conta pai: o sandbox só existe nesse número.
export const REMETENTE_SANDBOX_WHATSAPP = "whatsapp:+14155238886";

// Sender de WhatsApp já Online na conta pai. Não é o número do sandbox.
// A flag abaixo é o único jeito de a régua usá-lo, e só no modo teste.
export const REMETENTE_OFICIAL_WHATSAPP = "whatsapp:+16504762069";

const SID_CONTEUDO = /^HX[0-9a-fA-F]{32}$/;

type AmbienteSandbox = Record<string, string | undefined>;

const CHAVE_CONTENT_SID: Record<TipoTemplateWhatsapp, string> = {
  BOLETO_GERADO: "TWILIO_CONTENT_SID_BOLETO_GERADO",
  VENCE_EM_DIAS: "TWILIO_CONTENT_SID_VENCE_EM_DIAS",
  VENCEU: "TWILIO_CONTENT_SID_VENCEU",
  PAGO: "TWILIO_CONTENT_SID_PAGO",
};

function ligadoPelaFlag(valor: string | undefined) {
  return valor?.trim().toLowerCase() === "true";
}

function ligadoPeloRemetente(valor: string | undefined) {
  const texto = valor?.trim().toLowerCase() ?? "";
  return texto === REMETENTE_SANDBOX_WHATSAPP || texto === "+14155238886";
}

// Liga o caminho de teste. TWILIO_WHATSAPP_FROM só conta quando é o sandbox
// oficial. Qualquer outro remetente não usa a conta pai.
export function sandboxWhatsappLigado(env: AmbienteSandbox = process.env) {
  return ligadoPelaFlag(env.TWILIO_WHATSAPP_SANDBOX) || ligadoPeloRemetente(env.TWILIO_WHATSAPP_FROM);
}

// O sandbox nunca substitui o Sender ONLINE e nunca vale fora do modo teste.
export function usarSandboxWhatsapp(modoTeste: boolean, env: AmbienteSandbox = process.env) {
  return modoTeste && sandboxWhatsappLigado(env);
}

// Liga o teste controlado do Sender da conta pai. Qualquer valor que não seja
// "true" fica desligado. Fora do modo teste a função é falsa: a flag não
// autoriza envio para cliente nem troca o Sender da subconta.
export function remetenteOficialTesteLigado(env: AmbienteSandbox = process.env) {
  return ligadoPelaFlag(env.TWILIO_WHATSAPP_SENDER_OFICIAL);
}

export function usarRemetenteOficialTeste(modoTeste: boolean, env: AmbienteSandbox = process.env) {
  return modoTeste && remetenteOficialTesteLigado(env);
}

// ContentSid criado na conta pai. O da subconta não serve no sandbox.
export function contentSidSandbox(tipo: string, env: AmbienteSandbox = process.env): string | null {
  if (!TIPOS_TEMPLATE_WHATSAPP.includes(tipo as TipoTemplateWhatsapp)) return null;
  const chave = CHAVE_CONTENT_SID[tipo as TipoTemplateWhatsapp];
  const sid = env[chave]?.trim() ?? "";
  return SID_CONTEUDO.test(sid) ? sid : null;
}
