import { NOME_PRODUTO } from "./marca";

export const VALIDADE_REDEFINICAO_MS = 60 * 60 * 1000;

export const MENSAGEM_REDEFINICAO_ENVIADA =
  "Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. Ele vale por 1 hora.";

export const MENSAGEM_LINK_INVALIDO = "Este link não vale mais. Peça outro.";

export function sessaoCompativel(versaoDoToken: number, versaoDoUsuario: number): boolean {
  return versaoDoToken === versaoDoUsuario;
}

export function montarEmailRedefinicao(link: string): { assunto: string; texto: string; html: string } {
  const assunto = `Redefinir sua senha no ${NOME_PRODUTO}`;
  const texto = [
    `Recebemos um pedido para redefinir a senha da sua conta no ${NOME_PRODUTO}.`,
    "",
    "Abra o link abaixo para escolher uma senha nova. Ele vale por 1 hora e só pode ser usado uma vez.",
    link,
    "",
    "Se você não pediu isso, ignore este e-mail. Sua senha continua a mesma.",
  ].join("\n");
  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#f4f7fb;color:#051a3a;font-family:Outfit,ui-sans-serif,system-ui,sans-serif"><main style="max-width:32rem;margin:0 auto;padding:2rem 1.25rem"><p style="margin:0;font-size:1.5rem;font-weight:500;letter-spacing:-0.04em">taguaro</p><h1 style="font-size:1.75rem;font-weight:500;letter-spacing:-0.03em">Redefinir senha</h1><p style="line-height:1.6;color:#5a6b80">Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora e só pode ser usado uma vez.</p><p style="margin:1.75rem 0"><a href="${escaparHref(link)}" style="display:inline-block;background:#0b3861;color:#f4f7fb;text-decoration:none;border-radius:999px;padding:0.75rem 1.25rem;font-weight:500">Escolher uma senha nova</a></p><p style="font-size:0.875rem;line-height:1.5;color:#5a6b80">Se o botão não abrir, copie este endereço:<br>${escaparTexto(link)}</p><p style="font-size:0.875rem;line-height:1.5;color:#5a6b80">Se você não pediu isso, ignore este e-mail. Sua senha continua a mesma.</p></main></body></html>`;
  return { assunto, texto, html };
}

function escaparTexto(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escaparHref(valor: string): string {
  return escaparTexto(valor).replaceAll("'", "&#39;");
}
