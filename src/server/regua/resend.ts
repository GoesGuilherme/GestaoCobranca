import { ErroAplicacao } from "@/server/erros";

export type EmailResend = {
  de: string;
  para: string;
  assunto: string;
  texto: string;
  replyTo: string | null;
};

export type ClienteResend = {
  enviar(dados: EmailResend & { chave: string }): Promise<void>;
};

export function redigirSegredoResend(texto: string): string {
  return texto.replace(/re_[A-Za-z0-9_]+/g, "re_[redigida]");
}

export function clienteResendMemoria(caixa: EmailResend[] = []): ClienteResend & { caixa: EmailResend[] } {
  return {
    caixa,
    async enviar(dados) {
      caixa.push({
        de: dados.de,
        para: dados.para,
        assunto: dados.assunto,
        texto: dados.texto,
        replyTo: dados.replyTo,
      });
    },
  };
}

export function clienteResendHttp(): ClienteResend {
  return {
    async enviar(dados) {
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
            reply_to: dados.replyTo ?? undefined,
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
    },
  };
}

export function clienteResendPadrao(): ClienteResend {
  if (process.env.NODE_ENV === "production") return clienteResendHttp();
  return clienteResendMemoria();
}

export function remetenteResend(nome: string, email: string): string {
  const limpo = nome.replace(/[<>]/g, "").trim();
  if (!limpo) return email;
  return `${limpo} <${email}>`;
}
