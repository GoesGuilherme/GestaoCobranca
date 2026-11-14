import { esquemaConfiguracaoAsaas } from "./validacao";

export type AmbienteAsaasForm = "SANDBOX" | "PRODUCAO";

export type RascunhoAsaas = {
  ambiente: AmbienteAsaasForm;
  chaveApi: string;
};

export type AsaasGravado = {
  ambiente: AmbienteAsaasForm;
  configurado: boolean;
};

/**
 * O Salvar começa desligado. Só liga com ambiente ou chave válidos e diferentes
 * do que já está gravado. A chave em branco, numa conta já configurada, significa
 * manter a chave atual. A função não devolve a chave.
 */
export function salvarAsaasHabilitado(atual: RascunhoAsaas, gravado: AsaasGravado): boolean {
  const chaveInformada = atual.chaveApi.trim() !== "";
  const ambienteMudou = atual.ambiente !== gravado.ambiente;
  if (!ambienteMudou && !chaveInformada) return false;

  const validado = esquemaConfiguracaoAsaas.safeParse({
    ambiente: atual.ambiente,
    chaveApi: atual.chaveApi,
  });
  if (!validado.success) return false;
  if (!gravado.configurado && !validado.data.chaveApi) return false;
  return ambienteMudou || Boolean(validado.data.chaveApi);
}
