export class ErroTwilio extends Error {
  status: number;
  codigo: number | null;

  constructor(mensagem: string, status: number, codigo: number | null = null) {
    super(mensagem);
    this.name = "ErroTwilio";
    this.status = status;
    this.codigo = codigo;
  }
}

export type CredencialTwilio = {
  accountSid: string;
  authToken: string;
};

export type CoexistenciaTwilio = "ATIVA" | "INDISPONIVEL" | "DESCONHECIDA";

export type SenderTwilio = {
  sid: string;
  status: string;
  senderId: string;
  coexistencia: CoexistenciaTwilio;
  accountTypeAceito: boolean;
};

export type PedidoSender = {
  telefoneE164: string;
  nome: string;
  wabaId: string | null;
  webhookUrl: string;
  pedirCoexistencia: boolean;
};

export type TemplateConteudo = {
  nome: string;
  idioma: string;
  corpo: string;
  variaveisExemplo: Record<string, string>;
  categoria: "UTILITY";
};

export type ConteudoTwilio = {
  sid: string;
  aprovacao: string;
  motivo: string | null;
  categoria: string;
};

export type MensagemTemplate = {
  de: string;
  para: string;
  contentSid: string;
  variaveis: Record<string, string>;
  statusCallback: string;
};

export type ClienteTwilio = {
  criarSubconta(pai: CredencialTwilio, nome: string): Promise<{ sid: string; authToken: string }>;
  criarSender(conta: CredencialTwilio, pedido: PedidoSender): Promise<SenderTwilio>;
  obterSender(conta: CredencialTwilio, senderSid: string): Promise<SenderTwilio>;
  enviarCodigo(conta: CredencialTwilio, senderSid: string, codigo: string): Promise<SenderTwilio>;
  publicarTemplate(conta: CredencialTwilio, template: TemplateConteudo): Promise<ConteudoTwilio>;
  consultarTemplate(conta: CredencialTwilio, contentSid: string): Promise<ConteudoTwilio>;
  enviarMensagem(conta: CredencialTwilio, mensagem: MensagemTemplate): Promise<{ sid: string }>;
};

const CHAVES_COEXISTENCIA = ["coexistence", "coexistence_status", "whatsapp_business_app", "coexistencia"];

export function lerCoexistencia(corpo: unknown): CoexistenciaTwilio {
  const valores: string[] = [];
  function visitar(no: unknown, profundidade: number) {
    if (profundidade > 4 || !no || typeof no !== "object") return;
    for (const [chave, valor] of Object.entries(no as Record<string, unknown>)) {
      if (CHAVES_COEXISTENCIA.includes(chave.toLowerCase())) {
        valores.push(String(valor).toLowerCase());
      } else if (valor && typeof valor === "object") {
        visitar(valor, profundidade + 1);
      }
    }
  }
  visitar(corpo, 0);
  const texto = valores.join(" ");
  if (!texto) return "DESCONHECIDA";
  if (/(enabled|active|ativa|available|true)/.test(texto)) return "ATIVA";
  if (/(disabled|unavailable|indisponivel|false|unsupported)/.test(texto)) return "INDISPONIVEL";
  return "DESCONHECIDA";
}

export function statusAprovacao(valor: string): string {
  const texto = valor.trim().toLowerCase();
  if (texto === "approved") return "APROVADO";
  if (texto === "rejected") return "REJEITADO";
  if (texto === "unsubmitted") return "RASCUNHO";
  if (texto === "received" || texto === "pending") return "ENVIADO_APROVACAO";
  return "ENVIADO_APROVACAO";
}
