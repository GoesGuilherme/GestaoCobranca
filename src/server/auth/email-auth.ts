import { REMETENTE_AUTH_PADRAO } from "@/lib/remetentes";
import { ErroAplicacao } from "@/server/erros";
import { redigirSegredoResend } from "@/server/regua/resend";

export type EmailAuth = {
  de: string;
  chave: string;
  para: string;
  assunto: string;
  texto: string;
  html: string;
};

export function lerRemetenteAuth(): { chave: string; de: string } | null {
  const chave = process.env.AUTH_RESEND_API_KEY?.trim() ?? "";
  if (!chave) return null;
  const de = process.env.AUTH_EMAIL_FROM?.trim() || REMETENTE_AUTH_PADRAO;
  if (!de.includes("@")) return null;
  return { chave, de };
}

export function descreverRemetenteAusente(): string {
  const chave = Boolean(process.env.AUTH_RESEND_API_KEY?.trim());
  const de = process.env.AUTH_EMAIL_FROM?.trim() ?? "";
  if (!chave) return "Defina AUTH_RESEND_API_KEY.";
  if (de && !de.includes("@")) return "AUTH_EMAIL_FROM precisa ser um e-mail. O padrão é noreply@taguaro.com.br.";
  return "Defina AUTH_RESEND_API_KEY.";
}

export async function enviarEmailAuth(dados: EmailAuth): Promise<void> {
  let resposta: Response;
  try {
    resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dados.chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: dados.de,
        to: [dados.para],
        subject: dados.assunto,
        text: dados.texto,
        html: dados.html,
      }),
    });
  } catch (erro) {
    const mensagem = redigirSegredoResend(erro instanceof Error ? erro.message : "Falha de rede.");
    throw new ErroAplicacao(mensagem, 502, "resend_rede");
  }
  if (!resposta.ok) {
    await resposta.text().catch(() => "");
    throw new ErroAplicacao("A Resend recusou o e-mail.", 502, "resend_recusou");
  }
}
