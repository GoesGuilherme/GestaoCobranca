export const LIMITE_LOGO_BYTES = 512 * 1024;

export const MENSAGEM_LOGO_TIPO =
  "Envie a logo em PNG ou JPG. SVG e outros formatos não entram no e-mail.";

export const MENSAGEM_LOGO_TAMANHO = "A logo pode ter no máximo 512 KB.";

export const MENSAGEM_LOGO_VAZIA = "O arquivo da logo está vazio.";

export type MimeLogo = "image/png" | "image/jpeg";

export type ResumoLogo = {
  temLogo: boolean;
  atualizadoEm: string | null;
  caminho: string | null;
};

export type ResultadoLogo =
  | { ok: true; mime: MimeLogo }
  | { ok: false; erro: string };

// Cuid do Prisma e o id fixo da Collab (collab_software). Sem ponto, barra ou maiúscula.
const ID_EMPRESA = /^[a-z0-9_]{8,40}$/;

export function idEmpresaLogo(valor: string): boolean {
  return ID_EMPRESA.test(valor);
}

export function validarLogo(bytes: Uint8Array): ResultadoLogo {
  if (bytes.byteLength === 0) return { ok: false, erro: MENSAGEM_LOGO_VAZIA };
  if (bytes.byteLength > LIMITE_LOGO_BYTES) return { ok: false, erro: MENSAGEM_LOGO_TAMANHO };
  if (ehPng(bytes)) return { ok: true, mime: "image/png" };
  if (ehJpeg(bytes)) return { ok: true, mime: "image/jpeg" };
  return { ok: false, erro: MENSAGEM_LOGO_TIPO };
}

export function caminhoLogoPublica(empresaId: string, versao: string): string | null {
  if (!idEmpresaLogo(empresaId)) return null;
  return `/api/publico/logos/${empresaId}?v=${encodeURIComponent(versao)}`;
}

export function origemDosEmails(env: NodeJS.ProcessEnv = process.env): string | null {
  const configurada = env.PAGAMENTOS_PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
  if (configurada.startsWith("https://")) return configurada;

  const producao = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/$/, "") ?? "";
  if (producao.startsWith("https://")) return producao;
  if (producao && !producao.startsWith("http://")) return `https://${producao}`;

  const vercel = env.VERCEL_URL?.trim().replace(/\/$/, "") ?? "";
  if (vercel.startsWith("https://")) return vercel;
  if (vercel && !vercel.startsWith("http://")) return `https://${vercel}`;

  return null;
}

export function urlPublicaLogo(empresaId: string, versao: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const caminho = caminhoLogoPublica(empresaId, versao);
  const origem = origemDosEmails(env);
  if (!caminho || !origem) return null;
  return `${origem}${caminho}`;
}

export function dataUrlLogo(mime: MimeLogo, bytes: Uint8Array): string {
  let binario = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return `data:${mime};base64,${btoa(binario)}`;
}

function ehPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function ehJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
