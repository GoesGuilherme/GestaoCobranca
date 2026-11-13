import { montarEmailAviso, type DadosEmailAviso } from "@/lib/email-aviso";
import { absolutizarCaminho, absolutizarLinkCobranca, caminhoQrPix } from "@/lib/pix-link";
import { pngDoBrCode } from "@/lib/pix-qr";
import type { AnexoEmail } from "@/server/regua/resend";

type FaturaPixEmail = {
  provedor: string;
  pixCopiaCola: string | null;
  tokenPublico?: string | null;
};

export async function cartaComPix(
  dados: DadosEmailAviso,
  fatura: FaturaPixEmail,
): Promise<{ texto: string; html: string; anexos: AnexoEmail[] }> {
  const link = absolutizarLinkCobranca(dados.link);
  if (fatura.provedor !== "PIX_DIRETO" || !fatura.pixCopiaCola) {
    const carta = montarEmailAviso({ ...dados, link });
    return { ...carta, anexos: [] };
  }
  const caminho = fatura.tokenPublico ? caminhoQrPix(fatura.tokenPublico) : null;
  const qrLink = caminho ? absolutizarCaminho(caminho) : null;
  try {
    const png = await pngDoBrCode(fatura.pixCopiaCola);
    const carta = montarEmailAviso({
      ...dados,
      link,
      rotuloBotao: "Pagar com Pix",
      qrSrc: "cid:pix-qr",
      qrLink,
    });
    return {
      ...carta,
      anexos: [
        {
          nome: "pix-qr.png",
          conteudoBase64: png.toString("base64"),
          tipo: "image/png",
          contentId: "pix-qr",
        },
      ],
    };
  } catch {
    const carta = montarEmailAviso({ ...dados, link, rotuloBotao: "Pagar com Pix", qrLink });
    return { ...carta, anexos: [] };
  }
}
