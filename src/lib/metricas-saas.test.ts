import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { middleware } from "@/middleware";
import {
  calcularMetricas,
  fimDaAssinatura,
  fimDoCliente,
  type VinculoMetrica,
} from "./metricas-saas";

const HOJE = "2026-10-28";

function vinculo(parcial: Partial<VinculoMetrica> & Pick<VinculoMetrica, "clienteId" | "valor">): VinculoMetrica {
  return {
    inicio: "2026-01-01",
    fim: null,
    clienteFim: null,
    ...parcial,
  };
}

describe("métricas de assinatura", () => {
  it("sem clientes deixa o MRR zerado e não inventa LTV", () => {
    const metricas = calcularMetricas(HOJE, []);
    expect(metricas.mrr).toBe("0.00");
    expect(metricas.clientesAtivos).toBe(0);
    expect(metricas.churnClientes).toBeNull();
    expect(metricas.churnReceita).toBeNull();
    expect(metricas.ltvDisponivel).toBe(false);
    expect(metricas.ltv).toBeNull();
    expect(metricas.semMensalidades).toBe(true);
    expect(metricas.meses).toHaveLength(12);
  });

  it("com churn zero por doze meses avisa que o LTV não dá para calcular", () => {
    const metricas = calcularMetricas(HOJE, [vinculo({ clienteId: "a", valor: "100.00", inicio: "2025-01-01" })]);
    expect(metricas.mrr).toBe("100.00");
    expect(metricas.churnClientes).toBe(BigInt(0));
    expect(metricas.variacao).toBe(BigInt(0));
    expect(metricas.ltvDisponivel).toBe(false);
    expect(metricas.vidaMeses).toBeNull();
    expect(metricas.mesesNaMedia).toBe(12);
  });

  it("conta o cancelamento no meio do mês só no mês em que a mensalidade acaba", () => {
    const metricas = calcularMetricas(HOJE, [
      vinculo({ clienteId: "a", valor: "200.00", inicio: "2026-01-01", fim: "2026-10-15" }),
    ]);
    const setembro = metricas.meses.find((mes) => mes.mes === "2026-09");
    const outubro = metricas.meses.find((mes) => mes.mes === "2026-10");
    expect(setembro?.mrr).toBe("200.00");
    expect(setembro?.perdidos).toBe(0);
    expect(outubro?.mrr).toBe("0.00");
    expect(outubro?.perdidos).toBe(1);
    expect(outubro?.churnClientes).toBe(BigInt(1000000));
    expect(outubro?.churnReceita).toBe(BigInt(1000000));
    expect(metricas.variacao).toBe(BigInt(-1000000));
  });

  it("mês sem assinantes no começo não divide churn por zero", () => {
    const metricas = calcularMetricas(HOJE, [
      vinculo({ clienteId: "a", valor: "80.00", inicio: "2026-10-01" }),
    ]);
    const setembro = metricas.meses.find((mes) => mes.mes === "2026-09");
    expect(setembro?.mrr).toBe("0.00");
    expect(setembro?.churnClientes).toBeNull();
    expect(setembro?.churnReceita).toBeNull();
    expect(metricas.mrr).toBe("80.00");
    expect(metricas.variacao).toBeNull();
    expect(metricas.ltvDisponivel).toBe(false);
  });

  it("perde metade dos clientes e a receita correspondente", () => {
    const metricas = calcularMetricas(HOJE, [
      vinculo({ clienteId: "a", valor: "100.00", inicio: "2025-01-01" }),
      vinculo({ clienteId: "b", valor: "300.00", inicio: "2025-01-01", fim: "2026-10-02" }),
    ]);
    expect(metricas.mrr).toBe("100.00");
    expect(metricas.clientesAtivos).toBe(1);
    expect(metricas.ticket).toBe("100.00");
    expect(metricas.churnClientes).toBe(BigInt(500000));
    expect(metricas.churnReceita).toBe(BigInt(750000));
  });

  it("cliente bloqueado sai do MRR mesmo com a mensalidade ainda ativa", () => {
    const metricas = calcularMetricas(HOJE, [
      vinculo({ clienteId: "a", valor: "150.00", inicio: "2025-06-01", clienteFim: "2026-10-10" }),
    ]);
    expect(metricas.mrr).toBe("0.00");
    expect(metricas.churnClientes).toBe(BigInt(1000000));
    expect(metricas.meses.find((mes) => mes.mes === "2026-09")?.mrr).toBe("150.00");
  });

  it("calcula LTV quando há churn médio nos últimos doze meses", () => {
    const saidas = [
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ];
    const vinculos: VinculoMetrica[] = [];
    for (let indice = 0; indice < 10; indice += 1) {
      vinculos.push(vinculo({ clienteId: `fixo-${indice}`, valor: "100.00", inicio: "2024-01-01" }));
    }
    for (const mes of saidas) {
      vinculos.push(vinculo({ clienteId: `sai-${mes}`, valor: "100.00", inicio: "2024-01-01", fim: `${mes}-05` }));
    }
    const metricas = calcularMetricas(HOJE, vinculos);
    expect(metricas.mesesNaMedia).toBeGreaterThanOrEqual(6);
    expect(metricas.ltvDisponivel).toBe(true);
    expect(metricas.ltv).not.toBeNull();
    expect(metricas.vidaMeses).not.toBeNull();
  });

  it("marca o fim da mensalidade pausada, cancelada ou do cliente bloqueado", () => {
    expect(fimDaAssinatura("ATIVO", "ACTIVE", "2026-10-01")).toBeNull();
    expect(fimDaAssinatura("ATIVO", null, "2026-10-01")).toBeNull();
    expect(fimDaAssinatura("INATIVO", "ACTIVE", "2026-10-01")).toBe("2026-10-01");
    expect(fimDaAssinatura("ATIVO", "INACTIVE", "2026-10-02")).toBe("2026-10-02");
    expect(fimDaAssinatura("ATIVO", "CANCELADA", "2026-10-03")).toBe("2026-10-03");
    expect(fimDoCliente("ATIVO", "2026-10-01")).toBeNull();
    expect(fimDoCliente("EM_IMPLANTACAO", "2026-10-01")).toBeNull();
    expect(fimDoCliente("BLOQUEADO", "2026-10-04")).toBe("2026-10-04");
    expect(fimDoCliente("INATIVO", "2026-10-05")).toBe("2026-10-05");
  });
});

describe("acesso da aba Métricas", () => {
  it("só o dono entra", async () => {
    async function token(papel: "DONO" | "FINANCEIRO" | "SUPORTE") {
      return emitirToken({
        sub: papel,
        email: `${papel.toLowerCase()}@exemplo.test`,
        nome: papel,
        empresaId: "empresa",
        papel,
        superadministrador: false,
      });
    }
    const financeiro = await token("FINANCEIRO");
    const suporte = await token("SUPORTE");
    const dono = await token("DONO");
    expect(
      (await middleware(new NextRequest("http://127.0.0.1/dashboards/metricas", { headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` } }))).status,
    ).toBe(403);
    expect(
      (await middleware(new NextRequest("http://127.0.0.1/dashboards/metricas", { headers: { cookie: `${COOKIE_SESSAO}=${suporte}` } }))).status,
    ).toBe(403);
    expect(
      (await middleware(new NextRequest("http://127.0.0.1/dashboards/metricas", { headers: { cookie: `${COOKIE_SESSAO}=${dono}` } }))).status,
    ).toBe(200);
  });
});
