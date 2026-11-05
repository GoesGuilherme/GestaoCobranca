import { ErroAplicacao } from "@/server/erros";
import { redigirTexto } from "@/server/seguranca/redacao";
import { ErroEvolution, type ClienteEvolution, type EstadoEvolution, type QrEvolution } from "./contrato";
import { qrDeBase64 } from "./qr";

type Ambiente = {
  NODE_ENV?: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_API_KEY?: string;
  EVOLUTION_WHATSAPP_ENABLED?: string;
};

type FetchEvolution = (input: string, init: RequestInit) => Promise<Response>;

const EVENTOS = ["CONNECTION_UPDATE", "QRCODE_UPDATED", "MESSAGES_UPDATE"];

export function urlEvolutionConfiavel(bruto: string, env: Ambiente): URL {
  let url: URL;
  try {
    url = new URL(bruto.trim());
  } catch {
    throw new ErroAplicacao("EVOLUTION_API_URL não é um endereço válido.", 500, "evolution_sem_url");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ErroAplicacao("EVOLUTION_API_URL não pode levar usuário, senha ou query.", 500, "evolution_sem_url");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const httpLocal = url.protocol === "http:" && local && env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !httpLocal) {
    throw new ErroAplicacao("EVOLUTION_API_URL precisa ser https.", 500, "evolution_sem_url");
  }
  return url;
}

function baseDe(env: Ambiente): string {
  const url = urlEvolutionConfiavel(env.EVOLUTION_API_URL ?? "", env);
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

function chaveDe(env: Ambiente): string {
  const chave = env.EVOLUTION_API_KEY?.trim() ?? "";
  if (chave.length < 16) {
    throw new ErroAplicacao("Defina EVOLUTION_API_KEY no servidor. Ela não é digitada na tela.", 500, "evolution_sem_chave");
  }
  return chave;
}

function afirmarHttpPermitido(env: Ambiente) {
  if (env.NODE_ENV === "test") {
    throw new ErroAplicacao("O teste não chama a Evolution.", 500, "evolution_rede_proibida");
  }
  if (env.EVOLUTION_WHATSAPP_ENABLED !== "true") {
    throw new ErroAplicacao("A conexão por QR Code está desligada.", 404, "evolution_desligada");
  }
}

function estadoDe(valor: unknown): EstadoEvolution {
  const texto = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  if (texto === "open" || texto === "connected" || texto === "conectado") return "CONECTADO";
  if (texto === "connecting" || texto === "qrcode" || texto === "qr") return "CONECTANDO";
  if (texto === "close" || texto === "closed" || texto === "desconectado") return "DESCONECTADO";
  return "ERRO";
}

function objeto(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  return valor as Record<string, unknown>;
}

function qrDoCorpo(corpo: Record<string, unknown>): QrEvolution | null {
  const aninhado = objeto(corpo.qrcode);
  const imagem =
    qrDeBase64(corpo.base64) ??
    qrDeBase64(aninhado?.base64) ??
    qrDeBase64(corpo.qrcode);
  return imagem ? { imagem } : null;
}

function estadoDoCorpo(corpo: Record<string, unknown>): EstadoEvolution {
  const instancia = objeto(corpo.instance);
  return estadoDe(instancia?.state ?? instancia?.status ?? corpo.state ?? corpo.status);
}

function idMensagem(corpo: Record<string, unknown>): string | null {
  const chave = objeto(corpo.key);
  const id = chave?.id ?? corpo.id ?? corpo.messageId;
  if (typeof id !== "string") return null;
  const limpo = id.trim();
  if (!/^[A-Za-z0-9._:-]{6,128}$/.test(limpo)) return null;
  return limpo;
}

async function lerJson(resposta: Response): Promise<Record<string, unknown>> {
  const texto = await resposta.text().catch(() => "");
  if (!texto) return {};
  try {
    const json = JSON.parse(texto) as unknown;
    const corpo = objeto(json);
    if (!corpo) return {};
    return corpo;
  } catch {
    throw new ErroEvolution(redigirTexto(texto) || "A Evolution respondeu de forma ilegível.", resposta.status);
  }
}

function mensagemDe(corpo: Record<string, unknown>, status: number, segredos: string[]) {
  const bruto = typeof corpo.message === "string" ? corpo.message : typeof corpo.error === "string" ? corpo.error : "";
  const texto = redigirTexto(bruto || `A Evolution respondeu ${status}.`);
  let limpo = texto;
  for (const segredo of segredos) {
    if (segredo.length >= 8) limpo = limpo.split(segredo).join("[redigido]");
  }
  return limpo.slice(0, 180);
}

export function criarClienteEvolutionHttp(opcoes: {
  env?: Ambiente;
  fetchImpl?: FetchEvolution;
} = {}): ClienteEvolution {
  const env = opcoes.env ?? process.env;
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  afirmarHttpPermitido(env);
  const base = baseDe(env);
  const chave = chaveDe(env);

  async function chamar(caminho: string, init: RequestInit): Promise<Record<string, unknown>> {
    const resposta = await fetchImpl(`${base}${caminho}`, {
      ...init,
      headers: {
        apikey: chave,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = await lerJson(resposta);
    if (!resposta.ok) throw new ErroEvolution(mensagemDe(corpo, resposta.status, [chave]), resposta.status);
    return corpo;
  }

  return {
    async garantirInstancia(nome, webhookUrl, segredoWebhook) {
      const corpo = await chamar("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: nome,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          rejectCall: true,
          groupsIgnore: true,
          readMessages: false,
          readStatus: false,
          syncFullHistory: false,
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            headers: { apikey: segredoWebhook },
            events: EVENTOS,
          },
        }),
      });
      return qrDoCorpo(corpo) ?? qrDoCorpo(objeto(corpo.qrcode) ?? {});
    },
    async conectar(nome) {
      const corpo = await chamar(`/instance/connect/${encodeURIComponent(nome)}`, { method: "GET" });
      return qrDoCorpo(corpo);
    },
    async estado(nome) {
      const corpo = await chamar(`/instance/connectionState/${encodeURIComponent(nome)}`, { method: "GET" });
      return estadoDoCorpo(corpo);
    },
    async desconectar(nome) {
      await chamar(`/instance/logout/${encodeURIComponent(nome)}`, { method: "DELETE" });
    },
    async enviarTexto(nome, numero, texto) {
      const corpo = await chamar(`/message/sendText/${encodeURIComponent(nome)}`, {
        method: "POST",
        body: JSON.stringify({ number: numero, text: texto }),
      });
      const id = idMensagem(corpo);
      if (!id) throw new ErroEvolution("A Evolution não devolveu a mensagem.", 502);
      return { id };
    },
  };
}
