const HORA_MS = 60 * 60 * 1000;
export const ESPERA_DESCONEXAO_MAX_MS = 7 * 24 * HORA_MS;

export function proximaEsperaDesconexao(agora: Date, criadoEm: Date): { esgotou: boolean; disponivelEm: Date } {
  const decorrido = agora.getTime() - criadoEm.getTime();
  if (decorrido >= ESPERA_DESCONEXAO_MAX_MS) return { esgotou: true, disponivelEm: agora };
  const passo = decorrido < HORA_MS ? 15 * 60 * 1000 : decorrido < 4 * HORA_MS ? HORA_MS : 4 * HORA_MS;
  return { esgotou: false, disponivelEm: new Date(agora.getTime() + passo) };
}
