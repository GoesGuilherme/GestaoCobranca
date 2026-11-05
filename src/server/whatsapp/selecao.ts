export type ProvedorWhatsapp = "TWILIO" | "EVOLUTION";

export function evolutionWhatsappHabilitada(env: { EVOLUTION_WHATSAPP_ENABLED?: string } | NodeJS.ProcessEnv = process.env): boolean {
  return env.EVOLUTION_WHATSAPP_ENABLED === "true";
}

export function provedorEfetivo(flagLigada: boolean, escolha: string | null | undefined): ProvedorWhatsapp {
  if (flagLigada && escolha === "EVOLUTION") return "EVOLUTION";
  return "TWILIO";
}

export function nomeInstanciaDaEmpresa(empresaId: string): string {
  const limpo = empresaId.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (limpo.length < 8) {
    throw new Error("empresa_invalida");
  }
  return `tg${limpo.slice(0, 40)}`;
}

export function instanciaEvolutionValida(nome: string): boolean {
  return /^tg[a-z0-9]{8,40}$/.test(nome);
}
