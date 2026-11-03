type Campos = Record<string, string | number | boolean | null | undefined>;

function linha(nivel: "info" | "erro", evento: string, campos: Campos) {
  const seguro: Record<string, string | number | boolean | null> = {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    seguro[chave] = valor;
  }
  console[nivel === "info" ? "info" : "error"](JSON.stringify({ origem: "inter", evento, ...seguro }));
}

export function logInter(evento: string, campos: Campos = {}) {
  linha("info", evento, campos);
}

export function logInterErro(evento: string, campos: Campos = {}) {
  linha("erro", evento, campos);
}
