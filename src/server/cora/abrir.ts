import { ErroAplicacao } from "@/server/erros";
import { accessTokenEmpresa } from "./conta";
import type { ClienteHttpCora } from "./contrato";
import { criarClienteHttpCora, transporteHttpsCora } from "./http";

export async function abrirClienteCora(empresaId: string, injetado?: ClienteHttpCora): Promise<ClienteHttpCora> {
  if (injetado) return injetado;
  const transporte = transporteHttpsCora();
  const http = criarClienteHttpCora((forcar) => accessTokenEmpresa(empresaId, transporte, Boolean(forcar)), transporte);
  return {
    testarConexao: () => http.testarConexao(),
    criarFatura: (dados) => http.criarFatura(dados),
    consultarFatura: (id) => http.consultarFatura(id),
    cancelarFatura: (id) => http.cancelarFatura(id),
  };
}

export function traduzirErroCora(erro: unknown): never {
  if (erro instanceof ErroAplicacao) throw erro;
  throw new ErroAplicacao("Não foi possível concluir a operação na Cora.", 502, "cora_rede");
}
