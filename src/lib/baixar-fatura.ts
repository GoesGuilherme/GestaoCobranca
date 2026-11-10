export const MENSAGEM_FATURA_SEM_DOCUMENTO = "Esta fatura não tem documento para baixar.";
export const MENSAGEM_DOWNLOAD_FALHOU = "Não foi possível baixar o documento desta fatura.";
export const NOME_ARQUIVO_FATURA = "fatura.pdf";

// O arquivo é o PDF do boleto. No Asaas e na Cora, boletoUrl já aponta para
// esse PDF. No Inter, boletoUrl é a rota existente /api/faturas/:id/pdf.
// A página de pagamento (faturaUrl) não é arquivo e continua só no WhatsApp e no e-mail.
const CAMINHO_PDF = /^\/api\/faturas\/[A-Za-z0-9_-]{1,64}\/pdf$/;

export type DocumentoFatura =
  | { disponivel: true; href: string; nomeArquivo: string; origem: "aplicacao" | "provedor" }
  | { disponivel: false; mensagem: string };

function semDocumento(): DocumentoFatura {
  return { disponivel: false, mensagem: MENSAGEM_FATURA_SEM_DOCUMENTO };
}

function caminhoPdf(valor: string): string | null {
  const caminho = valor.split(/[?#]/, 1)[0] ?? "";
  return CAMINHO_PDF.test(caminho) ? caminho : null;
}

export function documentoDaFatura(fatura: { boletoUrl: string | null }): DocumentoFatura {
  const bruto = fatura.boletoUrl?.trim() ?? "";
  if (!bruto) return semDocumento();

  if (bruto.startsWith("/")) {
    const caminho = caminhoPdf(bruto);
    if (!caminho) return semDocumento();
    return { disponivel: true, href: caminho, nomeArquivo: NOME_ARQUIVO_FATURA, origem: "aplicacao" };
  }

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return semDocumento();
  }
  if (url.protocol !== "https:" || url.username || url.password) return semDocumento();

  const caminho = caminhoPdf(url.pathname);
  if (caminho) {
    return { disponivel: true, href: caminho, nomeArquivo: NOME_ARQUIVO_FATURA, origem: "aplicacao" };
  }

  return { disponivel: true, href: url.href, nomeArquivo: NOME_ARQUIVO_FATURA, origem: "provedor" };
}

export function mensagemDaRespostaDownload(entrada: {
  ok: boolean;
  contentType: string;
  corpo: string;
}): string | null {
  if (entrada.ok && entrada.contentType.toLowerCase().includes("application/pdf")) return null;
  const texto = entrada.corpo.trim();
  if (texto.startsWith("{")) {
    try {
      const json = JSON.parse(texto) as { erro?: unknown };
      if (typeof json.erro === "string") {
        const mensagem = json.erro.trim();
        if (mensagem) return mensagem.slice(0, 300);
      }
    } catch {
      // Corpo que parece JSON, mas não é uma resposta da API.
    }
  }
  return MENSAGEM_DOWNLOAD_FALHOU;
}

export async function lerMensagemDownload(resposta: Response): Promise<string | null> {
  const tipo = resposta.headers.get("content-type") ?? "";
  if (resposta.ok && tipo.toLowerCase().includes("application/pdf")) return null;
  const corpo = await resposta.text().catch(() => "");
  return mensagemDaRespostaDownload({ ok: resposta.ok, contentType: tipo, corpo });
}
