import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroAplicacao } from "@/server/erros";

const acesso = vi.hoisted(() => ({
  exigirAcesso: vi.fn(),
  consultarCnpj: vi.fn(),
}));

vi.mock("@/server/auth/acesso", () => ({
  exigirAcesso: acesso.exigirAcesso,
}));

vi.mock("@/server/cnpj/consultar", () => ({
  consultarCnpj: acesso.consultarCnpj,
}));

import { GET } from "./route";

beforeEach(() => {
  acesso.exigirAcesso.mockReset();
  acesso.consultarCnpj.mockReset();
});

describe("GET /api/cnpj", () => {
  it("exige sessão e não consulta o CNPJ de quem não entrou", async () => {
    acesso.exigirAcesso.mockRejectedValue(new ErroAplicacao("Não autenticado.", 401, "nao_autenticado"));
    const resposta = await GET(new Request("http://localhost/api/cnpj?cnpj=19131243000197"));
    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toEqual({
      erro: "Não autenticado.",
      codigo: "nao_autenticado",
    });
    expect(acesso.consultarCnpj).not.toHaveBeenCalled();
  });

  it("devolve os campos da empresa logada", async () => {
    acesso.exigirAcesso.mockResolvedValue({ empresaId: "emp-1" });
    acesso.consultarCnpj.mockResolvedValue({
      cnpj: "19131243000197",
      campos: { razaoSocial: "Open Knowledge Brasil", cidade: "São Paulo" },
    });
    const resposta = await GET(new Request("http://localhost/api/cnpj?cnpj=19.131.243/0001-97"));
    expect(resposta.status).toBe(200);
    expect(acesso.consultarCnpj).toHaveBeenCalledWith("19.131.243/0001-97", "emp-1");
    await expect(resposta.json()).resolves.toEqual({
      cnpj: "19131243000197",
      campos: { razaoSocial: "Open Knowledge Brasil", cidade: "São Paulo" },
    });
  });

  it("repassa o erro em português quando a consulta falha", async () => {
    acesso.exigirAcesso.mockResolvedValue({ empresaId: "emp-1" });
    acesso.consultarCnpj.mockRejectedValue(
      new ErroAplicacao(
        "Não encontramos este CNPJ. Confira o número ou preencha os dados manualmente.",
        404,
        "cnpj_nao_encontrado",
      ),
    );
    const resposta = await GET(new Request("http://localhost/api/cnpj?cnpj=19131243000197"));
    expect(resposta.status).toBe(404);
    const corpo = await resposta.json();
    expect(corpo.erro).toBe("Não encontramos este CNPJ. Confira o número ou preencha os dados manualmente.");
    expect(corpo).not.toHaveProperty("stack");
  });
});
