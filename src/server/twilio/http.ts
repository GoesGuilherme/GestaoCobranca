import { ErroAplicacao } from "@/server/erros";
import {
  type ClienteTwilio,
  type CredencialTwilio,
  type PedidoSender,
  type SenderTwilio,
  ErroTwilio,
  lerCoexistencia,
} from "./contrato";

type AmbienteTwilio = {
  NODE_ENV?: string;
  TWILIO_MOCK?: string;
};

type FetchTwilio = (input: string, init: RequestInit) => Promise<Response>;

const URL_CONTAS = "https://api.twilio.com/2010-04-01/Accounts.json";
const URL_SENDERS = "https://messaging.twilio.com/v2/Channels/Senders";
const URL_CONTENT = "https://content.twilio.com/v1/Content";

export function afirmarHttpTwilioPermitido(env: AmbienteTwilio = process.env) {
  if (env.NODE_ENV !== "production") {
    throw new ErroAplicacao(
      "Fora de produção o WhatsApp fica no mock e não chama a Twilio.",
      500,
      "twilio_mock_obrigatorio",
    );
  }
  if (env.TWILIO_MOCK === "true") {
    throw new ErroAplicacao("TWILIO_MOCK não pode ficar ligado em produção.", 500, "twilio_mock_proibido");
  }
}

function basico(conta: CredencialTwilio) {
  return `Basic ${Buffer.from(`${conta.accountSid}:${conta.authToken}`).toString("base64")}`;
}

function redigir(texto: string, segredos: string[]) {
  let limpo = texto;
  for (const segredo of segredos) {
    if (segredo.length >= 8) limpo = limpo.split(segredo).join("[redigido]");
  }
  return limpo.replace(/auth_token["']?\s*[:=]\s*["'][^"']+["']/gi, "auth_token:[redigido]").slice(0, 240);
}

async function lerCorpo(resposta: Response, segredos: string[]): Promise<Record<string, unknown>> {
  const texto = await resposta.text().catch(() => "");
  if (!texto) return {};
  try {
    const json = JSON.parse(texto) as unknown;
    if (!json || typeof json !== "object") return {};
    return json as Record<string, unknown>;
  } catch {
    throw new ErroTwilio(redigir(texto, segredos) || "A Twilio respondeu de forma ilegível.", resposta.status, null);
  }
}

function codigoDe(corpo: Record<string, unknown>): number | null {
  const valor = corpo.code ?? corpo.error_code;
  return typeof valor === "number" ? valor : null;
}

function mensagemDe(corpo: Record<string, unknown>, status: number, segredos: string[]) {
  const bruto = typeof corpo.message === "string" ? corpo.message : `A Twilio respondeu ${status}.`;
  return redigir(bruto, segredos);
}

function senderDe(corpo: Record<string, unknown>, accountTypeAceito: boolean, pedirCoexistencia: boolean): SenderTwilio {
  const sid = typeof corpo.sid === "string" ? corpo.sid : "";
  const status = typeof corpo.status === "string" ? corpo.status : "OFFLINE";
  const senderId = typeof corpo.sender_id === "string" ? corpo.sender_id : "";
  if (!sid) throw new ErroTwilio("A Twilio não devolveu o Sender.", 502, null);
  return {
    sid,
    status,
    senderId,
    coexistencia: pedirCoexistencia ? lerCoexistencia(corpo) : "DESCONHECIDA",
    accountTypeAceito,
  };
}

export function criarClienteTwilioHttp(
  opcoes: { fetchImpl?: FetchTwilio; env?: AmbienteTwilio } = {},
): ClienteTwilio {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const env = opcoes.env ?? process.env;

  async function pedir(
    conta: CredencialTwilio,
    url: string,
    metodo: string,
    corpo: BodyInit | undefined,
    contentType: string,
  ) {
    afirmarHttpTwilioPermitido(env);
    let resposta: Response;
    try {
      resposta = await fetchImpl(url, {
        method: metodo,
        headers: {
          Authorization: basico(conta),
          ...(corpo ? { "Content-Type": contentType } : {}),
        },
        body: corpo,
        signal: AbortSignal.timeout(15000),
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Falha de rede.";
      throw new ErroTwilio(redigir(mensagem, [conta.authToken]), 502, null);
    }
    const json = await lerCorpo(resposta, [conta.authToken]);
    return { resposta, json };
  }

  async function criarSenderComTipo(conta: CredencialTwilio, pedido: PedidoSender, comTipo: boolean) {
    const configuration: Record<string, string> = {};
    if (pedido.wabaId) configuration.waba_id = pedido.wabaId;
    configuration.verification_method = "sms";
    if (comTipo) configuration.account_type = "ISVSubAccount";
    const { resposta, json } = await pedir(
      conta,
      URL_SENDERS,
      "POST",
      JSON.stringify({
        sender_id: `whatsapp:${pedido.telefoneE164}`,
        configuration,
        profile: { name: pedido.nome, vertical: "Professional Services" },
        webhook: {
          callback_url: pedido.webhookUrl,
          callback_method: "POST",
          status_callback_url: pedido.webhookUrl,
          status_callback_method: "POST",
        },
      }),
      "application/json",
    );
    if (!resposta.ok && comTipo && resposta.status === 400) {
      const mensagem = typeof json.message === "string" ? json.message.toLowerCase() : "";
      if (mensagem.includes("account_type") || mensagem.includes("account type")) {
        return criarSenderComTipo(conta, pedido, false);
      }
    }
    if (!resposta.ok) {
      throw new ErroTwilio(mensagemDe(json, resposta.status, [conta.authToken]), resposta.status, codigoDe(json));
    }
    return senderDe(json, comTipo, pedido.pedirCoexistencia);
  }

  return {
    async criarSubconta(pai, nome) {
      const { resposta, json } = await pedir(
        pai,
        URL_CONTAS,
        "POST",
        new URLSearchParams({ FriendlyName: nome.slice(0, 64) }),
        "application/x-www-form-urlencoded",
      );
      if (!resposta.ok) {
        throw new ErroTwilio(mensagemDe(json, resposta.status, [pai.authToken]), resposta.status, codigoDe(json));
      }
      const sid = typeof json.sid === "string" ? json.sid : "";
      const authToken = typeof json.auth_token === "string" ? json.auth_token : "";
      if (!sid || !authToken) throw new ErroTwilio("A Twilio não devolveu a subconta.", 502, null);
      return { sid, authToken };
    },
    criarSender(conta, pedido) {
      return criarSenderComTipo(conta, pedido, true);
    },
    async obterSender(conta, senderSid) {
      const { resposta, json } = await pedir(conta, `${URL_SENDERS}/${senderSid}`, "GET", undefined, "application/json");
      if (!resposta.ok) {
        throw new ErroTwilio(mensagemDe(json, resposta.status, [conta.authToken]), resposta.status, codigoDe(json));
      }
      return senderDe(json, true, true);
    },
    async enviarCodigo(conta, senderSid, codigo) {
      const { resposta, json } = await pedir(
        conta,
        `${URL_SENDERS}/${senderSid}`,
        "POST",
        JSON.stringify({ configuration: { verification_code: codigo } }),
        "application/json",
      );
      if (!resposta.ok) {
        throw new ErroTwilio(mensagemDe(json, resposta.status, [conta.authToken]), resposta.status, codigoDe(json));
      }
      return senderDe(json, true, true);
    },
    async publicarTemplate(conta, template) {
      const criado = await pedir(
        conta,
        URL_CONTENT,
        "POST",
        JSON.stringify({
          friendly_name: template.nome,
          language: template.idioma,
          variables: template.variaveisExemplo,
          types: { "twilio/text": { body: template.corpo } },
        }),
        "application/json",
      );
      if (!criado.resposta.ok) {
        throw new ErroTwilio(mensagemDe(criado.json, criado.resposta.status, [conta.authToken]), criado.resposta.status, codigoDe(criado.json));
      }
      const contentSid = typeof criado.json.sid === "string" ? criado.json.sid : "";
      if (!contentSid) throw new ErroTwilio("A Twilio não devolveu o template.", 502, null);
      const aprovacao = await pedir(
        conta,
        `${URL_CONTENT}/${contentSid}/ApprovalRequests/whatsapp`,
        "POST",
        JSON.stringify({ name: template.nome, category: template.categoria }),
        "application/json",
      );
      if (!aprovacao.resposta.ok) {
        throw new ErroTwilio(
          mensagemDe(aprovacao.json, aprovacao.resposta.status, [conta.authToken]),
          aprovacao.resposta.status,
          codigoDe(aprovacao.json),
        );
      }
      const status = typeof aprovacao.json.status === "string" ? aprovacao.json.status : "received";
      const motivo = typeof aprovacao.json.rejection_reason === "string" ? aprovacao.json.rejection_reason : null;
      return { sid: contentSid, aprovacao: status, motivo, categoria: template.categoria };
    },
    async consultarTemplate(conta, contentSid) {
      const { resposta, json } = await pedir(
        conta,
        `${URL_CONTENT}/${contentSid}/ApprovalRequests`,
        "GET",
        undefined,
        "application/json",
      );
      if (!resposta.ok) {
        throw new ErroTwilio(mensagemDe(json, resposta.status, [conta.authToken]), resposta.status, codigoDe(json));
      }
      const whatsapp = json.whatsapp;
      const bloco = whatsapp && typeof whatsapp === "object" ? (whatsapp as Record<string, unknown>) : json;
      const status = typeof bloco.status === "string" ? bloco.status : "pending";
      const motivo = typeof bloco.rejection_reason === "string" ? bloco.rejection_reason : null;
      const categoria = typeof bloco.category === "string" ? bloco.category : "UTILITY";
      return { sid: contentSid, aprovacao: status, motivo, categoria };
    },
    async enviarMensagem(conta, mensagem) {
      const { resposta, json } = await pedir(
        conta,
        `https://api.twilio.com/2010-04-01/Accounts/${conta.accountSid}/Messages.json`,
        "POST",
        new URLSearchParams({
          From: mensagem.de,
          To: mensagem.para,
          ContentSid: mensagem.contentSid,
          ContentVariables: JSON.stringify(mensagem.variaveis),
          StatusCallback: mensagem.statusCallback,
        }),
        "application/x-www-form-urlencoded",
      );
      if (!resposta.ok) {
        throw new ErroTwilio(mensagemDe(json, resposta.status, [conta.authToken]), resposta.status, codigoDe(json));
      }
      const sid = typeof json.sid === "string" ? json.sid : "";
      if (!sid) throw new ErroTwilio("A Twilio não devolveu a mensagem.", 502, null);
      return { sid };
    },
    async enviarTexto(conta, mensagem) {
      const { resposta, json } = await pedir(
        conta,
        `https://api.twilio.com/2010-04-01/Accounts/${conta.accountSid}/Messages.json`,
        "POST",
        new URLSearchParams({
          From: mensagem.de,
          To: mensagem.para,
          Body: mensagem.corpo,
          StatusCallback: mensagem.statusCallback,
        }),
        "application/x-www-form-urlencoded",
      );
      if (!resposta.ok) {
        throw new ErroTwilio(mensagemDe(json, resposta.status, [conta.authToken]), resposta.status, codigoDe(json));
      }
      const sid = typeof json.sid === "string" ? json.sid : "";
      if (!sid) throw new ErroTwilio("A Twilio não devolveu a mensagem.", 502, null);
      return { sid };
    },
  };
}
