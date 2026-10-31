import { timingSafeEqual } from "node:crypto";

export function cronAutorizado(request: Request): boolean | "ausente" {
  const esperado = process.env.CRON_SECRET?.trim() ?? "";
  if (!esperado) return "ausente";
  const autorizacao = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(autorizacao)?.[1]?.trim() ?? "";
  const informado = bearer || (request.headers.get("x-cron-secret")?.trim() ?? "");
  const recebido = Buffer.from(informado);
  const secreto = Buffer.from(esperado);
  if (recebido.length === 0 || recebido.length !== secreto.length) return false;
  return timingSafeEqual(recebido, secreto);
}
