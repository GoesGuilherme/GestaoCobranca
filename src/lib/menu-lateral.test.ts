import { describe, expect, it } from "vitest";
import { idGrupoAtual, itemAtivo, montarGruposMenu, type OpcoesMenu } from "./menu-lateral";

const dono: OpcoesMenu = {
  mostrarUsuarios: true,
  mostrarFaturas: true,
  mostrarRegua: true,
  mostrarAssessor: true,
  mostrarAsaas: true,
};

const financeiro: OpcoesMenu = {
  mostrarUsuarios: false,
  mostrarFaturas: true,
  mostrarRegua: true,
  mostrarAssessor: true,
  mostrarAsaas: false,
};

const suporte: OpcoesMenu = {
  mostrarUsuarios: false,
  mostrarFaturas: false,
  mostrarRegua: false,
  mostrarAssessor: false,
  mostrarAsaas: false,
};

describe("menu lateral", () => {
  it("tira Financeiro do menu e deixa a aba do Dashboard como destino", () => {
    const grupos = montarGruposMenu(dono);
    const itens = grupos.flatMap((grupo) => grupo.itens);

    expect(itens.map((item) => item.rotulo)).not.toContain("Financeiro");
    expect(itens.map((item) => item.href)).not.toContain("/dashboards/financeiro");
    expect(grupos.map((grupo) => grupo.titulo)).toEqual([
      "Visão geral",
      "Cobrança",
      "Cadastros",
      "Configurações",
    ]);
    expect(grupos.find((grupo) => grupo.id === "visao")?.itens).toEqual([
      { href: "/dashboards/painel", rotulo: "Dashboards" },
    ]);
  });

  it("mantém Visão geral com um item para o menu fechado destacar a aba atual", () => {
    for (const opcoes of [dono, financeiro, suporte]) {
      const visao = montarGruposMenu(opcoes).find((grupo) => grupo.id === "visao");
      expect(visao?.itens).toHaveLength(1);
    }

    const grupos = montarGruposMenu(financeiro);
    expect(idGrupoAtual("/dashboards/financeiro", "", grupos)).toBe("visao");
    expect(idGrupoAtual("/dashboards/painel", "", grupos)).toBe("visao");
    expect(idGrupoAtual("/dashboards/resultado", "", grupos)).toBe("visao");
    expect(idGrupoAtual("/dashboards/metricas", "", grupos)).toBe("visao");
    expect(idGrupoAtual("/faturas", "", grupos)).toBe("cobranca");
    expect(itemAtivo("/dashboards/financeiro", "", "/dashboards/painel")).toBe(true);
    expect(itemAtivo("/faturas", "", "/dashboards/painel")).toBe(false);
  });

  it("esconde grupos vazios e separa WhatsApp da régua pelo hash", () => {
    const grupos = montarGruposMenu(suporte);
    expect(grupos.map((grupo) => grupo.id)).toEqual(["visao", "cadastros"]);
    expect(itemAtivo("/regua", "", "/regua")).toBe(true);
    expect(itemAtivo("/regua", "#whatsapp", "/regua")).toBe(false);
    expect(itemAtivo("/regua", "#whatsapp", "/regua#whatsapp")).toBe(true);
    expect(itemAtivo("/regua", "", "/regua#whatsapp")).toBe(false);
  });

  it("reserva o destaque da plataforma para /admin", () => {
    const grupos = montarGruposMenu(dono);
    expect(idGrupoAtual("/admin", "", grupos)).toBe("plataforma");
    expect(idGrupoAtual("/admin/empresas", "", grupos)).toBe("plataforma");
    expect(idGrupoAtual("/empresa", "", grupos)).toBe("configuracoes");
  });
});
