import { generateText } from "ai";
import { EXTRACAO_VAZIA, modeloComprovante, type ExtracaoComprovante } from "@/lib/comprovante";
import { dataIsoValida } from "@/lib/data";
import { normalizarDinheiro } from "@/lib/dinheiro";

export const MARCA_COMPROVANTE_TESTE = "COMPROVANTE_JSON:";

const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function mimeDeComprovante(mime: string): string | null {
  const limpo = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIMES.has(limpo) ? limpo : null;
}

function texto(valor: unknown, limite: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

export function extracaoDeJson(bruto: unknown): ExtracaoComprovante {
  if (!bruto || typeof bruto !== "object") return EXTRACAO_VAZIA;
  const corpo = bruto as Record<string, unknown>;
  const pagoEm = texto(corpo.pagoEm, 10);
  return {
    parece: corpo.parece === true,
    valor: normalizarDinheiro(corpo.valor),
    pagoEm: pagoEm && dataIsoValida(pagoEm) ? pagoEm : null,
    hora: texto(corpo.hora, 8),
    pagador: texto(corpo.pagador, 120),
    recebedorNome: texto(corpo.recebedorNome, 120),
    recebedorDocumento: texto(corpo.recebedorDocumento, 20),
    recebedorChave: texto(corpo.recebedorChave, 120),
    e2e: texto(corpo.e2e, 80),
  };
}

export function analisarComprovanteMemoria(bytes: Uint8Array): ExtracaoComprovante {
  const textoArquivo = Buffer.from(bytes).toString("utf8");
  const indice = textoArquivo.indexOf(MARCA_COMPROVANTE_TESTE);
  if (indice < 0) return EXTRACAO_VAZIA;
  const json = textoArquivo.slice(indice + MARCA_COMPROVANTE_TESTE.length).trim();
  try {
    return extracaoDeJson(JSON.parse(json) as unknown);
  } catch {
    return EXTRACAO_VAZIA;
  }
}

const PROMPT = [
  "Você lê comprovantes de pagamento brasileiros (Pix, TED ou boleto).",
  "Responda só um JSON, sem markdown, com as chaves:",
  "parece (boolean), valor (string com ponto decimal ou null), pagoEm (AAAA-MM-DD ou null), hora (HH:MM ou null),",
  "pagador (string ou null), recebedorNome (string ou null), recebedorDocumento (só dígitos ou null),",
  "recebedorChave (string ou null), e2e (ID da transação Pix ou null).",
  "parece é false se o arquivo não for um comprovante de pagamento.",
  "Não invente número, data nem documento. Se não estiver legível, use null.",
].join(" ");

export async function analisarComprovanteGateway(
  bytes: Uint8Array,
  mime: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ExtracaoComprovante> {
  const resultado = await generateText({
    model: modeloComprovante(env),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "file", data: bytes, mediaType: mime },
        ],
      },
    ],
    maxOutputTokens: 400,
    timeout: { totalMs: 20_000, stepMs: 20_000 },
  });
  const bruto = resultado.text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  try {
    return extracaoDeJson(JSON.parse(bruto) as unknown);
  } catch {
    return EXTRACAO_VAZIA;
  }
}

export function analisarComprovantePadrao(
  bytes: Uint8Array,
  mime: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ExtracaoComprovante> {
  if (env.NODE_ENV !== "production") return Promise.resolve(analisarComprovanteMemoria(bytes));
  return analisarComprovanteGateway(bytes, mime, env);
}
