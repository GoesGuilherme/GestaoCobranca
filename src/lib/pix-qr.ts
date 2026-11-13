import QRCode from "qrcode";

const OPCOES = {
  errorCorrectionLevel: "M" as const,
  margin: 2,
  color: { dark: "#051a3a", light: "#ffffff" },
};

export async function pngDoBrCode(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { ...OPCOES, type: "png", width: 320 });
}

export async function svgDoBrCode(payload: string): Promise<string> {
  return QRCode.toString(payload, { ...OPCOES, type: "svg" });
}
