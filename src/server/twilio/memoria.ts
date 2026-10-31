import { randomBytes } from "node:crypto";
import {
  type ClienteTwilio,
  type ConteudoTwilio,
  type MensagemTemplate,
  type MensagemTexto,
  type PedidoSender,
  type SenderTwilio,
  ErroTwilio,
  lerCoexistencia,
} from "./contrato";

export type MensagemRegistrada = MensagemTemplate & { sid: string };
export type TextoRegistrado = MensagemTexto & { sid: string };

export type ClienteTwilioMemoria = ClienteTwilio & {
  enviados: MensagemRegistrada[];
  textos: TextoRegistrado[];
  aprovacoes: { nome: string; categoria: string; contentSid: string }[];
  subcontas: { sid: string; authToken: string; nome: string }[];
  chamouRede: boolean;
};

function sid(prefixo: string) {
  return `${prefixo}${randomBytes(16).toString("hex")}`;
}

function senderDe(pedido: PedidoSender, senderSid: string, coexistencia: SenderTwilio["coexistencia"]): SenderTwilio {
  const corpo = {
    sid: senderSid,
    status: "ONLINE",
    sender_id: `whatsapp:${pedido.telefoneE164}`,
    configuration: { account_type: "ISVSubAccount", waba_id: pedido.wabaId },
    properties: coexistencia === "ATIVA" ? { coexistence: "ENABLED" } : {},
  };
  return {
    sid: senderSid,
    status: "ONLINE",
    senderId: corpo.sender_id,
    coexistencia: pedido.pedirCoexistencia ? lerCoexistencia(corpo) : "DESCONHECIDA",
    accountTypeAceito: true,
  };
}

// Cliente em memória. Não chama a Twilio e não guarda credencial de produção.
export function criarClienteTwilioMemoria(
  opcoes: { coexistencia?: "ATIVA" | "INDISPONIVEL" | "DESCONHECIDA" } = {},
): ClienteTwilioMemoria {
  const enviados: MensagemRegistrada[] = [];
  const textos: TextoRegistrado[] = [];
  const aprovacoes: ClienteTwilioMemoria["aprovacoes"] = [];
  const subcontas: ClienteTwilioMemoria["subcontas"] = [];
  const senders = new Map<string, SenderTwilio>();
  const conteudos = new Map<string, ConteudoTwilio>();
  const modo = opcoes.coexistencia ?? "DESCONHECIDA";

  const cliente: ClienteTwilioMemoria = {
    enviados,
    textos,
    aprovacoes,
    subcontas,
    chamouRede: false,
    async criarSubconta(_pai, nome) {
      const criada = { sid: sid("AC"), authToken: randomBytes(24).toString("hex"), nome };
      subcontas.push(criada);
      return { sid: criada.sid, authToken: criada.authToken };
    },
    async criarSender(_conta, pedido) {
      if (modo === "INDISPONIVEL") {
        throw new ErroTwilio(
          "A Twilio recusou o Sender: o número já está no WhatsApp e a Senders API não ofereceu coexistência (63110).",
          400,
          63110,
        );
      }
      const criado = senderDe(pedido, sid("XE"), modo === "ATIVA" ? "ATIVA" : "DESCONHECIDA");
      senders.set(criado.sid, criado);
      return criado;
    },
    async obterSender(_conta, senderSid) {
      return (
        senders.get(senderSid) ?? {
          sid: senderSid,
          status: "ONLINE",
          senderId: "",
          coexistencia: modo === "ATIVA" ? "ATIVA" : "DESCONHECIDA",
          accountTypeAceito: true,
        }
      );
    },
    async enviarCodigo(_conta, senderSid, codigo) {
      if (!/^\d{4,10}$/.test(codigo)) {
        throw new ErroTwilio("Código de verificação recusado.", 400, 63113);
      }
      const atual = senders.get(senderSid);
      const proximo: SenderTwilio = {
        sid: senderSid,
        status: "ONLINE",
        senderId: atual?.senderId ?? "",
        coexistencia: atual?.coexistencia ?? "DESCONHECIDA",
        accountTypeAceito: true,
      };
      senders.set(senderSid, proximo);
      return proximo;
    },
    async publicarTemplate(_conta, template) {
      if (template.categoria !== "UTILITY") {
        throw new ErroTwilio("Só publicamos template UTILITY.", 400, null);
      }
      const contentSid = sid("HX");
      const conteudo: ConteudoTwilio = {
        sid: contentSid,
        aprovacao: "approved",
        motivo: null,
        categoria: "UTILITY",
      };
      conteudos.set(contentSid, conteudo);
      aprovacoes.push({ nome: template.nome, categoria: template.categoria, contentSid });
      return conteudo;
    },
    async consultarTemplate(_conta, contentSid) {
      return (
        conteudos.get(contentSid) ?? {
          sid: contentSid,
          aprovacao: "approved",
          motivo: null,
          categoria: "UTILITY",
        }
      );
    },
    async enviarMensagem(_conta, mensagem) {
      const registrada = { ...mensagem, sid: sid("SM") };
      enviados.push(registrada);
      return { sid: registrada.sid };
    },
    async enviarTexto(_conta, mensagem) {
      const registrada = { ...mensagem, sid: sid("SM") };
      textos.push(registrada);
      return { sid: registrada.sid };
    },
  };
  return cliente;
}
