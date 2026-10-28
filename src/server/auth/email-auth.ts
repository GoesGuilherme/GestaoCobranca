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
  const de = process.env.AUTH_EMAIL_FROM?.trim() ?? "";
  if (!chave || !de.includes("@")) return null;
  return { chave, de };
}

export function descreverRemetenteAusente(): string {
  const chave = Boolean(process.env.AUTH_RESEND_API_KEY?.trim());
  const de = Boolean(process.env.AUTH_EMAIL_FROM?.trim());
  if (!chave && !de) return "Defina AUTH_RESEND_API_KEY e AUTH_EMAIL_FROM.";
  if (!chave) return "Defina AUTH_RESEND_API_KEY.";
  return "Defina AUTH_EMAIL_FROM com um endereço do domínio já verificado.";
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
