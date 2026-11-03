import { ErroAplicacao } from "@/server/erros";
import { lerCredenciaisPagamento } from "@/server/pagamentos/credenciais";
import type { ClienteHttpInter, CredenciaisInter } from "./contrato";
import { criarClienteHttpInter } from "./cliente-http";

export async function abrirClienteInter(empresaId: string, injetado?: ClienteHttpInter): Promise<ClienteHttpInter> {
  if (injetado) return injetado;
  const lido = await lerCredenciaisPagamento(empresaId, "INTER");
  if (!lido?.credenciais.clientId || !lido.credenciais.clientSecret || !lido.credenciais.certificadoPem || !lido.credenciais.chavePrivadaPem) {
    throw new ErroAplicacao("Configure o Banco Inter desta empresa antes de emitir a cobrança.", 422, "inter_sem_config");
  }
  const credenciais: CredenciaisInter = {
    ambiente: lido.ambiente,
    clientId: lido.credenciais.clientId,
    clientSecret: lido.credenciais.clientSecret,
    certificadoPem: lido.credenciais.certificadoPem,
    chavePrivadaPem: lido.credenciais.chavePrivadaPem,
    contaCorrente: lido.credenciais.extra?.conta_corrente,
  };
  return criarClienteHttpInter(credenciais);
}
