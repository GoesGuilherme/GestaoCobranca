export const TEXTO_CAMPOS_OBRIGATORIOS = "Preencha os campos obrigatórios";

export const TEXTO_ERRO_GENERICO = "Não foi possível concluir a operação.";

export const DURACAO_SUCESSO_MS = 3500;

export const DURACAO_ERRO_MS = 8000;

export const COOKIE_TOAST = "taguaro_toast";

export type TipoToast = "sucesso" | "erro";

export type FlashToast = {
  tipo: TipoToast;
  mensagem: string;
};

const SEGREDO =
  /node_modules|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk_(?:live|test)_[A-Za-z0-9]+|bearer\s+[A-Za-z0-9._-]{8,}|\bat\s+\S+\s+\(/i;

export function mensagemErroVisivel(bruta: string | undefined | null): string {
  const original = bruta ?? "";
  const texto = original.replace(/\s+/g, " ").trim();
  if (!texto || texto.length > 280 || SEGREDO.test(original) || SEGREDO.test(texto)) return TEXTO_ERRO_GENERICO;
  return texto;
}

export function serializarFlash(toast: FlashToast): string {
  const json = JSON.stringify({ t: toast.tipo, m: toast.mensagem.slice(0, 240) });
  const bytes = new TextEncoder().encode(json);
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function interpretarFlash(valor: string | null | undefined): FlashToast | null {
  if (!valor) return null;
  try {
    const base = valor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base + "=".repeat((4 - (base.length % 4)) % 4);
    const binario = atob(padded);
    const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
    const dados = JSON.parse(new TextDecoder().decode(bytes)) as { t?: unknown; m?: unknown };
    if ((dados.t !== "sucesso" && dados.t !== "erro") || typeof dados.m !== "string") return null;
    if (SEGREDO.test(dados.m)) return dados.t === "erro" ? { tipo: "erro", mensagem: TEXTO_ERRO_GENERICO } : null;
    const mensagem = dados.m.replace(/\s+/g, " ").trim().slice(0, 240);
    if (!mensagem) return null;
    if (dados.t === "erro") return { tipo: "erro", mensagem: mensagemErroVisivel(mensagem) };
    return { tipo: "sucesso", mensagem };
  } catch {
    return null;
  }
}

export function lerFlashDoCabecalho(cookie: string): FlashToast | null {
  const parte = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_TOAST}=`));
  if (!parte) return null;
  return interpretarFlash(parte.slice(COOKIE_TOAST.length + 1));
}
