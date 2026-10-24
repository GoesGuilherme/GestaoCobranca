const CHAVE = /\$aact_[A-Za-z0-9_]+/g;

export function mensagemLogAsaas(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : "erro interno";
  return texto.replace(CHAVE, "[redigido]").slice(0, 300);
}

export function logAsaas(evento: string, dados: Record<string, string | number | boolean | null>) {
  console.info(`[asaas] ${evento}`, dados);
}

export function logAsaasErro(evento: string, dados: Record<string, string | number | boolean | null>) {
  console.error(`[asaas] ${evento}`, dados);
}
