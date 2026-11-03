import { somenteDigitos, somenteDocumento } from "@/lib/documento";
import type { PagadorCobranca } from "@/server/pagamentos/tipos";
import { ErroAplicacao } from "@/server/erros";

type ClientePagador = {
  razaoSocial: string;
  nomeFantasia: string;
  documento: string;
  email: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  enderecoCobranca: string | null;
  numeroCobranca: string | null;
  complementoCobranca: string | null;
  bairroCobranca: string | null;
  cepCobranca: string | null;
};

function telefone(whatsapp: string): { ddd?: string; telefone?: string } {
  let digitos = somenteDigitos(whatsapp);
  if (digitos.startsWith("55") && digitos.length >= 12) digitos = digitos.slice(2);
  if (digitos.length < 10) return {};
  return { ddd: digitos.slice(0, 2), telefone: digitos.slice(2, 11) };
}

export function pagadorDoCliente(cliente: ClientePagador): PagadorCobranca {
  const documento = somenteDocumento(cliente.documento);
  const endereco = cliente.enderecoCobranca?.trim() ?? "";
  const bairro = cliente.bairroCobranca?.trim() ?? "";
  const cep = somenteDigitos(cliente.cepCobranca ?? "");
  const cidade = cliente.cidade.trim();
  const uf = cliente.uf.trim().toUpperCase();
  if (!endereco || !bairro || cep.length !== 8 || cidade.length < 2 || uf.length !== 2) {
    const campos: Record<string, string> = {};
    if (!endereco) campos.endereco = "Informe o endereço.";
    if (!bairro) campos.bairro = "Informe o bairro.";
    if (cep.length !== 8) campos.cep = "Informe o CEP com 8 dígitos.";
    throw new ErroAplicacao(
      "O Banco Inter exige endereço, bairro, cidade, UF e CEP do pagador. Complete o cadastro do cliente.",
      422,
      "pagador_incompleto",
      campos,
    );
  }
  const fone = telefone(cliente.whatsapp);
  return {
    nome: (cliente.razaoSocial || cliente.nomeFantasia).slice(0, 100),
    cpfCnpj: documento,
    tipoPessoa: documento.length > 11 ? "JURIDICA" : "FISICA",
    email: cliente.email || undefined,
    ddd: fone.ddd,
    telefone: fone.telefone,
    endereco,
    numero: cliente.numeroCobranca?.trim() || "S/N",
    complemento: cliente.complementoCobranca?.trim() || undefined,
    bairro,
    cidade,
    uf,
    cep,
  };
}
