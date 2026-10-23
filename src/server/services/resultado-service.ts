import {
  calcularImposto,
  margemFinanceira,
  percentualSobre,
  somarDinheiroAssinado,
} from "@/lib/dinheiro";
import type { BlocoResultado, LinhaResultado, Resultado } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { exigirResultado, type AutorEmpresa } from "@/server/auth/papeis";

type VinculoResultado = {
  valor: { toFixed(casas: number): string };
  custo: { toFixed(casas: number): string } | null;
  recorrencia: "MENSAL" | "AVULSO";
  cliente: { id: string; nomeFantasia: string };
  servico: {
    id: string;
    nome: string;
    aliquotaImposto: { toFixed(casas: number): string } | null;
  };
};

type Acumulado = {
  id: string;
  nome: string;
  faturamento: string[];
  custo: string[];
  impostos: string[];
  margem: string[];
  semCusto: number;
};

function partes(vinculo: VinculoResultado) {
  const faturamento = vinculo.valor.toFixed(2);
  const custo = vinculo.custo ? vinculo.custo.toFixed(2) : null;
  const aliquota = vinculo.servico.aliquotaImposto ? vinculo.servico.aliquotaImposto.toFixed(2) : null;
  const impostos = calcularImposto(faturamento, aliquota);
  const margem = margemFinanceira(faturamento, custo, aliquota);
  if (impostos === null || margem === null) {
    throw new ErroAplicacao("Não foi possível calcular o resultado deste serviço.", 500);
  }
  return {
    faturamento,
    custo: custo ?? "0.00",
    impostos,
    margem,
    semCusto: custo === null,
  };
}

function novoAcumulado(id: string, nome: string): Acumulado {
  return { id, nome, faturamento: [], custo: [], impostos: [], margem: [], semCusto: 0 };
}

function acrescentar(grupo: Acumulado, item: ReturnType<typeof partes>) {
  grupo.faturamento.push(item.faturamento);
  grupo.custo.push(item.custo);
  grupo.impostos.push(item.impostos);
  grupo.margem.push(item.margem);
  if (item.semCusto) grupo.semCusto += 1;
}

function fecharLinha(grupo: Acumulado): LinhaResultado {
  const faturamento = somarDinheiroAssinado(grupo.faturamento);
  const margem = somarDinheiroAssinado(grupo.margem);
  return {
    id: grupo.id,
    nome: grupo.nome,
    faturamento,
    custo: somarDinheiroAssinado(grupo.custo),
    impostos: somarDinheiroAssinado(grupo.impostos),
    margem,
    margemPercentual: percentualSobre(margem, faturamento),
    semCusto: grupo.semCusto,
  };
}

function porNome(a: { nome: string }, b: { nome: string }) {
  return a.nome.localeCompare(b.nome, "pt-BR");
}

function montarBloco(vinculos: VinculoResultado[]): BlocoResultado {
  const clientes = new Map<string, Acumulado>();
  const servicos = new Map<string, Acumulado>();
  const total = novoAcumulado("total", "Total");
  const semCusto = new Map<string, string>();

  for (const vinculo of vinculos) {
    const item = partes(vinculo);
    acrescentar(total, item);
    const cliente = clientes.get(vinculo.cliente.id) ?? novoAcumulado(vinculo.cliente.id, vinculo.cliente.nomeFantasia);
    acrescentar(cliente, item);
    clientes.set(vinculo.cliente.id, cliente);
    const servico = servicos.get(vinculo.servico.id) ?? novoAcumulado(vinculo.servico.id, vinculo.servico.nome);
    acrescentar(servico, item);
    servicos.set(vinculo.servico.id, servico);
    if (item.semCusto) semCusto.set(vinculo.cliente.id, vinculo.cliente.nomeFantasia);
  }

  const fechado = fecharLinha(total);
  return {
    faturamento: fechado.faturamento,
    custo: fechado.custo,
    impostos: fechado.impostos,
    margem: fechado.margem,
    margemPercentual: fechado.margemPercentual,
    quantidade: vinculos.length,
    semCusto: fechado.semCusto,
    porCliente: [...clientes.values()].map(fecharLinha).sort(porNome),
    porServico: [...servicos.values()].map(fecharLinha).sort(porNome),
    clientesSemCusto: [...semCusto.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort(porNome),
  };
}

export async function obterResultado(autor: AutorEmpresa): Promise<Resultado> {
  exigirResultado(autor);
  const vinculos = await prisma.clienteServico.findMany({
    where: {
      empresaId: autor.empresaId,
      status: "ATIVO",
      cliente: {
        empresaId: autor.empresaId,
        status: { in: ["ATIVO", "EM_IMPLANTACAO"] },
      },
    },
    select: {
      valor: true,
      custo: true,
      recorrencia: true,
      cliente: { select: { id: true, nomeFantasia: true } },
      servico: { select: { id: true, nome: true, aliquotaImposto: true } },
    },
  });

  return {
    mensal: montarBloco(vinculos.filter((item) => item.recorrencia === "MENSAL")),
    avulso: montarBloco(vinculos.filter((item) => item.recorrencia === "AVULSO")),
  };
}
