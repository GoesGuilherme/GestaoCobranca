import { TIPOS_TEMPLATE_WHATSAPP, type TipoTemplateWhatsapp } from "@/lib/whatsapp-cobranca";

// Remetente fixo do WhatsApp Sandbox da Twilio. Não aceitamos outro From
// com a credencial da conta pai: o sandbox só existe nesse número.
export const REMETENTE_SANDBOX_WHATSAPP = "whatsapp:+14155238886";

// Sender de WhatsApp já Online na conta pai. Não é o número do sandbox.
// A flag liga este remetente. No modo teste ele só fala com o número de teste.
// Fora do modo teste ele fala com o cliente só depois de TWILIO_WHATSAPP_OFICIAL_DESDE.
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

// A flag liga o Sender da conta pai. Qualquer valor que não seja "true" fica desligado.
export function remetenteOficialLigado(env: AmbienteSandbox = process.env) {
  return ligadoPelaFlag(env.TWILIO_WHATSAPP_SENDER_OFICIAL);
}

export function remetenteOficialTesteLigado(env: AmbienteSandbox = process.env) {
  return remetenteOficialLigado(env);
}

export function usarRemetenteOficialTeste(modoTeste: boolean, env: AmbienteSandbox = process.env) {
  return modoTeste && remetenteOficialLigado(env);
}

// Sem esta data, o Sender oficial não fala com cliente real. Cobrança anterior fica de fora.
export function inicioWhatsappOficialProducao(env: AmbienteSandbox = process.env): Date | null {
  const bruto = env.TWILIO_WHATSAPP_OFICIAL_DESDE?.trim() ?? "";
  if (!bruto) return null;
  const data = new Date(bruto);
  if (Number.isNaN(data.getTime())) return null;
  return data;
}

export type RotaWhatsapp = "oficial_teste" | "oficial_producao" | "sandbox" | "empresa" | "nenhuma";

// O sandbox nunca sai do modo teste e nunca ganha do Sender oficial.
// O número da empresa só entra quando a flag oficial está desligada.
export function rotaWhatsapp(entrada: {
  modoTeste: boolean;
  oficialLigado: boolean;
  sandboxLigado: boolean;
  empresaPronta: boolean;
  producaoLiberada: boolean;
}): RotaWhatsapp {
  if (entrada.oficialLigado && entrada.modoTeste) return "oficial_teste";
  if (entrada.oficialLigado) return entrada.producaoLiberada ? "oficial_producao" : "nenhuma";
  if (entrada.modoTeste && entrada.sandboxLigado && !entrada.empresaPronta) return "sandbox";
  if (entrada.empresaPronta) return "empresa";
  return "nenhuma";
}

export function sinaisCanalWhatsapp(env: AmbienteSandbox = process.env) {
  return {
    remetenteOficialLigado: remetenteOficialTesteLigado(env),
    sandboxLigado: sandboxWhatsappLigado(env),
    numeroTesteConfigurado: Boolean(env.TWILIO_WHATSAPP_TESTE?.trim()),
    producaoOficialLiberada: inicioWhatsappOficialProducao(env) !== null,
    templatesContaPaiProntos: (Object.keys(CHAVE_CONTENT_SID) as TipoTemplateWhatsapp[]).every(
      (tipo) => contentSidSandbox(tipo, env) !== null,
    ),
  };
}

// ContentSid criado na conta pai. O da subconta não serve no sandbox.
export function contentSidSandbox(tipo: string, env: AmbienteSandbox = process.env): string | null {
  if (!TIPOS_TEMPLATE_WHATSAPP.includes(tipo as TipoTemplateWhatsapp)) return null;
  const chave = CHAVE_CONTENT_SID[tipo as TipoTemplateWhatsapp];
  const sid = env[chave]?.trim() ?? "";
  return SID_CONTEUDO.test(sid) ? sid : null;
}
