import { contentSidValido, type TipoTemplateWhatsapp } from "@/lib/whatsapp-cobranca";

// Remetente fixo do WhatsApp Sandbox da Twilio. Não aceitamos outro From
// com a credencial da conta pai: o sandbox só existe nesse número.
export const REMETENTE_SANDBOX_WHATSAPP = "whatsapp:+14155238886";

// Sender de WhatsApp já Online na conta pai. Não é o número do sandbox.
// A flag liga este remetente. No modo teste ele só fala com o número de teste.
// Fora do modo teste ele fala com o cliente só depois de TWILIO_WHATSAPP_OFICIAL_DESDE.
export const REMETENTE_OFICIAL_WHATSAPP = "whatsapp:+16504762069";

type AmbienteSandbox = Record<string, string | undefined>;

// Modelos sem botão, já usados pela conta pai. O envio cai neles quando o
// modelo com botão não está configurado ou ainda não foi aprovado.
const CHAVE_CONTENT_SID: Record<Exclude<TipoTemplateWhatsapp, "VENCE_HOJE">, string> = {
  BOLETO_GERADO: "TWILIO_CONTENT_SID_BOLETO_GERADO",
  VENCE_EM_DIAS: "TWILIO_CONTENT_SID_VENCE_EM_DIAS",
  VENCEU: "TWILIO_CONTENT_SID_VENCEU",
  PAGO: "TWILIO_CONTENT_SID_PAGO",
};

// VENCE_HOJE na conta pai é o modelo com botão. Não entra na checagem de
// "templates prontos": sem essa variável o passo segue em VENCE_EM_DIAS.
const CHAVE_CONTENT_SID_EXTRA: Partial<Record<TipoTemplateWhatsapp, string>> = {
  VENCE_HOJE: "TWILIO_CONTENT_SID_VENCE_HOJE",
};

// Modelos com o botão "Registrar promessa". Vazios, o envio usa o modelo sem botão.
const CHAVE_CONTENT_SID_BOTAO: Partial<Record<TipoTemplateWhatsapp, string>> = {
  BOLETO_GERADO: "TWILIO_CONTENT_SID_BOLETO_GERADO_V3",
  VENCE_EM_DIAS: "TWILIO_CONTENT_SID_VENCE_EM_DIAS_V3",
  VENCE_HOJE: "TWILIO_CONTENT_SID_VENCE_HOJE",
  VENCEU: "TWILIO_CONTENT_SID_VENCEU_V3",
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
// empresaPronta é o Sender antigo de configuracoes_twilio e só entra com a
// flag oficial desligada. A subconta de subcontas_twilio ganha da oficial em
// decidirSubcontaWhatsapp, quando o modelo da empresa está aprovado.
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

function chaveDoTipo(mapa: Partial<Record<TipoTemplateWhatsapp, string>>, tipo: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(mapa, tipo)) return null;
  return mapa[tipo as TipoTemplateWhatsapp] ?? null;
}

// ContentSid criado na conta pai. O da subconta não serve no sandbox.
export function contentSidSandbox(tipo: string, env: AmbienteSandbox = process.env): string | null {
  const chave = chaveDoTipo(CHAVE_CONTENT_SID, tipo) ?? chaveDoTipo(CHAVE_CONTENT_SID_EXTRA, tipo);
  if (!chave) return null;
  return contentSidValido(env[chave]);
}

// ContentSid do modelo com botão na conta pai. PAGO não tem.
export function contentSidBotaoContaPai(tipo: string, env: AmbienteSandbox = process.env): string | null {
  if (tipo === "PAGO") return null;
  const chave = chaveDoTipo(CHAVE_CONTENT_SID_BOTAO, tipo);
  if (!chave) return null;
  return contentSidValido(env[chave]);
}
