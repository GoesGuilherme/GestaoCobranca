const QR = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const QR_MAX = 180_000;

export function qrConfiavel(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo || limpo.length > QR_MAX || limpo.includes("..") || !QR.test(limpo)) return null;
  return limpo;
}

export function qrDeBase64(valor: unknown): string | null {
  const pronto = qrConfiavel(valor);
  if (pronto) return pronto;
  if (typeof valor !== "string") return null;
  const cru = valor.trim().replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cru) || cru.length < 80 || cru.length > QR_MAX) return null;
  return qrConfiavel(`data:image/png;base64,${cru}`);
}
