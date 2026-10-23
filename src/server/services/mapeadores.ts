import type { Cliente, ClienteServico, Filial, Servico } from "@/generated/prisma/client";
import { isoDeData } from "@/lib/data";
import { calcularMargem, somarDinheiro } from "@/lib/dinheiro";
import { formatarDocumento, formatarWhatsapp } from "@/lib/documento";
import type { ClienteDetalhe, ClienteResumo, ClienteServicoDTO, FilialDTO, ServicoDTO } from "@/lib/tipos";

type ValorDecimal = { toFixed(casas: number): string };

type ClienteComContagem = Omit<Cliente, "servicos"> & {
  _count?: { filiais: number };
  servicos?: { valor: ValorDecimal }[];
};

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
    valorMensalAtivo: somarDinheiro((cliente.servicos ?? []).map((item) => item.valor.toFixed(2))),
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

function textoDecimal(valor: { toFixed(casas: number): string } | null): string | null {
  return valor ? valor.toFixed(2) : null;
}

export function paraServico(
  servico: Servico & { _count?: { vinculos: number } },
  incluirCusto = false,
): ServicoDTO {
  const precoPadrao = servico.precoPadrao.toFixed(2);
  const custo = incluirCusto ? textoDecimal(servico.custo) : null;
  const aliquotaImposto = incluirCusto ? textoDecimal(servico.aliquotaImposto) : null;
  return {
    id: servico.id,
    nome: servico.nome,
    descricao: servico.descricao,
    precoPadrao,
    custo,
    aliquotaImposto,
    margem: incluirCusto ? calcularMargem(precoPadrao, custo, aliquotaImposto) : null,
    ativo: servico.ativo,
    quantidadeVinculos: servico._count?.vinculos ?? 0,
    criadoEm: servico.criadoEm.toISOString(),
    atualizadoEm: servico.atualizadoEm.toISOString(),
  };
}

export function paraClienteServico(
  vinculo: ClienteServico & {
    servico: {
      nome: string;
      custo: { toFixed(casas: number): string } | null;
      aliquotaImposto: { toFixed(casas: number): string } | null;
    };
  },
  incluirCusto = false,
): ClienteServicoDTO {
  const valor = vinculo.valor.toFixed(2);
  const custo = incluirCusto ? textoDecimal(vinculo.servico.custo) : null;
  const aliquotaImposto = incluirCusto ? textoDecimal(vinculo.servico.aliquotaImposto) : null;
  return {
    id: vinculo.id,
    clienteId: vinculo.clienteId,
    servicoId: vinculo.servicoId,
    nomeServico: vinculo.servico.nome,
    valor,
    custo,
    aliquotaImposto,
    margem: incluirCusto ? calcularMargem(valor, custo, aliquotaImposto) : null,
    recorrencia: vinculo.recorrencia,
    inicioEm: isoDeData(vinculo.inicioEm),
    status: vinculo.status,
    observacoes: vinculo.observacoes,
    criadoEm: vinculo.criadoEm.toISOString(),
    atualizadoEm: vinculo.atualizadoEm.toISOString(),
  };
}
