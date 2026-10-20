import type { Cliente, Filial } from "@/generated/prisma/client";
import { formatarDocumento, formatarWhatsapp } from "@/lib/documento";
import type { ClienteDetalhe, ClienteResumo, FilialDTO } from "@/lib/tipos";

type ClienteComContagem = Cliente & { _count?: { filiais: number } };

export function paraFilial(filial: Filial): FilialDTO {
  return {
    id: filial.id,
    clienteId: filial.clienteId,
    nome: filial.nome,
    cnpj: formatarDocumento(filial.cnpj, "CNPJ"),
    endereco: filial.endereco,
    cidade: filial.cidade,
    uf: filial.uf,
    status: filial.status,
    observacoes: filial.observacoes,
    criadoEm: filial.criadoEm.toISOString(),
    atualizadoEm: filial.atualizadoEm.toISOString(),
  };
}

export function paraCliente(cliente: ClienteComContagem): ClienteResumo {
  return {
    id: cliente.id,
    nomeFantasia: cliente.nomeFantasia,
    razaoSocial: cliente.razaoSocial,
    documento: formatarDocumento(cliente.documento, cliente.tipoDocumento),
    tipoDocumento: cliente.tipoDocumento,
    segmento: cliente.segmento,
    contatoNome: cliente.contatoNome,
    whatsapp: formatarWhatsapp(cliente.whatsapp),
    email: cliente.email,
    cidade: cliente.cidade,
    uf: cliente.uf,
    status: cliente.status,
    observacoes: cliente.observacoes,
    quantidadeFiliais: cliente._count?.filiais ?? 0,
    criadoEm: cliente.criadoEm.toISOString(),
    atualizadoEm: cliente.atualizadoEm.toISOString(),
  };
}

export function paraClienteDetalhe(
  cliente: ClienteComContagem & { filiais: Filial[] },
): ClienteDetalhe {
  return {
    ...paraCliente({ ...cliente, _count: { filiais: cliente.filiais.length } }),
    filiais: cliente.filiais.map(paraFilial),
  };
}
