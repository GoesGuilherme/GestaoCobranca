const PADROES = [
  /\$aact_[A-Za-z0-9_]+/g,
  /bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /apikey["']?\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /authorization["']?\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /(api[_-]?key|auth[_-]?token|client[_-]?secret|access[_-]?token)\s*[=:]\s*\S+/gi,
  /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{16,}/gi,
];

export function redigirTexto(valor: string): string {
  let limpo = valor;
  for (const padrao of PADROES) limpo = limpo.replace(padrao, "[redigido]");
  return limpo.slice(0, 300);
}

export function mensagemLogSegura(erro: unknown): string {
  if (erro instanceof Error) return `${erro.name}: ${redigirTexto(erro.message)}`;
  return "erro interno";
}
