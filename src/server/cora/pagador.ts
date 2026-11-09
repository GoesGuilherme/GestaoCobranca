import { somenteDigitos, somenteDocumento } from "@/lib/documento";
import type { PagadorCobranca } from "@/server/pagamentos/tipos";
import { ErroAplicacao } from "@/server/erros";

type ClientePagador = {
  razaoSocial: string;
  nomeFantasia: string;
  documento: string;
  email: string;
  cidade: string;
  uf: string;
  enderecoCobranca: string | null;
  numeroCobranca: string | null;
  complementoCobranca: string | null;
  bairroCobranca: string | null;
  cepCobranca: string | null;
};

export function pagadorCoraDoCliente(cliente: ClientePagador): PagadorCobranca {
  const documento = somenteDocumento(cliente.documento);
  const endereco = cliente.enderecoCobranca?.trim() ?? "";
  const bairro = cliente.bairroCobranca?.trim() ?? "";
  const cep = somenteDigitos(cliente.cepCobranca ?? "");
  const cidade = cliente.cidade.trim();
  const uf = cliente.uf.trim().toUpperCase();
  if (documento.length !== 11 && documento.length !== 14) {
    throw new ErroAplicacao("A Cora precisa do CPF ou CNPJ do pagador.", 422, "pagador_incompleto", {
      documento: "Informe o CPF ou CNPJ.",
    });
  }
  if (!endereco || !bairro || cep.length !== 8 || cidade.length < 2 || uf.length !== 2) {
    const campos: Record<string, string> = {};
    if (!endereco) campos.endereco = "Informe o endereço.";
    if (!bairro) campos.bairro = "Informe o bairro.";
    if (cep.length !== 8) campos.cep = "Informe o CEP com 8 dígitos.";
    throw new ErroAplicacao(
      "A Cora exige endereço, bairro, cidade, UF e CEP do pagador. Complete o cadastro do cliente.",
      422,
      "pagador_incompleto",
      campos,
    );
  }
  return {
    nome: (cliente.razaoSocial || cliente.nomeFantasia).slice(0, 60),
    cpfCnpj: documento,
    tipoPessoa: documento.length > 11 ? "JURIDICA" : "FISICA",
    email: cliente.email || undefined,
    endereco,
    numero: cliente.numeroCobranca?.trim() || "S/N",
    complemento: cliente.complementoCobranca?.trim() || undefined,
    bairro,
    cidade,
    uf,
    cep,
  };
}
