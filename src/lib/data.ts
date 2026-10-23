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

export function proximoVencimentoIso(dia: number, hoje: string): string | null {
  if (!Number.isInteger(dia) || dia < 1 || dia > 31 || !dataIsoValida(hoje)) return null;
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const diaHoje = Number(hoje.slice(8, 10));
  let anoAlvo = ano;
  let mesAlvo = mes;
  if (dia <= diaHoje) {
    mesAlvo += 1;
    if (mesAlvo > 12) {
      mesAlvo = 1;
      anoAlvo += 1;
    }
  }
  const ultimo = new Date(Date.UTC(anoAlvo, mesAlvo, 0)).getUTCDate();
  const diaReal = Math.min(dia, ultimo);
  const iso = `${anoAlvo}-${String(mesAlvo).padStart(2, "0")}-${String(diaReal).padStart(2, "0")}`;
  return dataIsoValida(iso) ? iso : null;
}

export function isoDeData(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
