type Campos = Record<string, string | number | boolean | null | undefined>;

const BLOQUEADAS = /token|secret|authorization|senha|code|refresh|access/i;

function linha(nivel: "info" | "erro", evento: string, campos: Campos) {
  const seguro: Record<string, string | number | boolean | null> = {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor === undefined || BLOQUEADAS.test(chave)) continue;
    seguro[chave] = valor;
  }
  console[nivel === "info" ? "info" : "error"](JSON.stringify({ origem: "cora", evento, ...seguro }));
}

export function logCora(evento: string, campos: Campos = {}) {
  linha("info", evento, campos);
}

export function logCoraErro(evento: string, campos: Campos = {}) {
  linha("erro", evento, campos);
}
