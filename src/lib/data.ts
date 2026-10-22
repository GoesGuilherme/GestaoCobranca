const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dataIsoValida(valor: string): boolean {
  const match = DATA_ISO.exec(valor);
  if (!match) return false;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  if (ano < 1990 || ano > 2100) return false;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

export function dataHojeIso(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const ano = partes.find((parte) => parte.type === "year")?.value ?? "";
  const mes = partes.find((parte) => parte.type === "month")?.value ?? "";
  const dia = partes.find((parte) => parte.type === "day")?.value ?? "";
  return `${ano}-${mes}-${dia}`;
}

export function isoDeData(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
