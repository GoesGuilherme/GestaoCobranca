import { describe, expect, it } from "vitest";
import { completarCnpj } from "./documento";
import {
  MENSAGEM_CNPJ_BAIXADA,
  MENSAGEM_CNPJ_FALHA,
  MENSAGEM_CNPJ_INAPTA,
  MENSAGEM_CNPJ_INVALIDO,
  MENSAGEM_CNPJ_NULA,
  MENSAGEM_CNPJ_SEM_DADOS,
  MENSAGEM_CNPJ_SUCESSO,
  MENSAGEM_CNPJ_SUSPENSA,
  aplicarConsulta,
  camposDaEmpresa,
  camposDoCliente,
  decidirConsultaCnpj,
  lerCamposCadastro,
  mapearRespostaBrasilApi,
  MEMORIA_CONSULTA,
  mesclarCadastro,
  mensagemVisivelConsulta,
  passoConsulta,
  type CamposCadastroCnpj,
  type ResultadoConsultaCnpj,
} from "./consulta-cnpj";

const CNPJ = "19131243000197";

const receita = {
  uf: "SP",
  cep: "01311902",
  email: null,
  bairro: "BELA VISTA",
  numero: "37",
  municipio: "SÃO PAULO",
  logradouro: "PAULISTA 37",
  complemento: "ANDAR 4",
  razao_social: "OPEN KNOWLEDGE BRASIL",
  nome_fantasia: "REDE PELO CONHECIMENTO LIVRE",
  ddd_telefone_1: "1123851939",
  situacao_cadastral: 2,
  descricao_situacao_cadastral: "ATIVA",
  descricao_tipo_de_logradouro: "AVENIDA",
  qsa: [{ nome_socio: "HAYDEE SVAB" }],
};

const digitado = {
  nomeFantasia: "Rascunho",
  razaoSocial: "Rascunho Ltda",
  documento: "11.111.111/1111-11",
  segmentoId: "seg-1",
  contatoNome: "Ana",
  whatsapp: "(13) 98888-1001",
  email: "ana@padaria.test",
  cidade: "Santos",
  uf: "SP",
  endereco: "Rua Velha",
  numero: "10",
  complemento: "Sala 1",
  bairro: "Centro",
  cep: "11010-000",
  status: "ATIVO",
  ativadoEm: "2024-01-01",
  observacoes: "Cliente antigo",
};

function aplicarCliente<T extends Record<string, string>>(
  atual: T,
  resultado: ResultadoConsultaCnpj,
  anteriores: Partial<Record<keyof T, string>> | null = null,
) {
  if (!resultado.ok) return { valores: atual, aplicados: anteriores ?? {} };
  return aplicarConsulta(
    atual,
    anteriores,
    camposDoCliente(resultado.campos) as Partial<Record<keyof T, string | undefined>>,
  );
}

describe("validação do CNPJ para consulta", () => {
  it("consulta o CNPJ completo com ou sem máscara", () => {
    expect(decidirConsultaCnpj(CNPJ)).toEqual({ acao: "consultar", cnpj: CNPJ });
    expect(decidirConsultaCnpj("19.131.243/0001-97")).toEqual({ acao: "consultar", cnpj: CNPJ });
    expect(decidirConsultaCnpj(`  ${CNPJ}  `)).toEqual({ acao: "consultar", cnpj: CNPJ });
  });

  it("espera enquanto o documento ainda não tem 14 caracteres", () => {
    expect(decidirConsultaCnpj("")).toEqual({ acao: "aguardar" });
    expect(decidirConsultaCnpj("529.982.247-25")).toEqual({ acao: "aguardar" });
    expect(decidirConsultaCnpj("19.131.243/0001")).toEqual({ acao: "aguardar" });
  });

  it("recusa CNPJ com dígito verificador errado sem pedir a consulta", () => {
    expect(decidirConsultaCnpj("19.131.243/0001-00")).toEqual({
      acao: "recusar",
      mensagem: MENSAGEM_CNPJ_INVALIDO,
      codigo: "cnpj_invalido",
    });
    expect(decidirConsultaCnpj("00.000.000/0000-00")).toEqual({
      acao: "recusar",
      mensagem: MENSAGEM_CNPJ_INVALIDO,
      codigo: "cnpj_invalido",
    });
  });

  it("aceita CNPJ alfanumérico válido", () => {
    const cnpj = completarCnpj("ab12cd34ef01");
    expect(decidirConsultaCnpj(cnpj)).toEqual({ acao: "consultar", cnpj });
  });
});

describe("mapeamento da BrasilAPI", () => {
  it("preenche os campos cadastrais que o formulário já pede", () => {
    const resultado = mapearRespostaBrasilApi(receita);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.mensagem).toBe(MENSAGEM_CNPJ_SUCESSO);
    expect(resultado.campos).toEqual({
      razaoSocial: "Open Knowledge Brasil",
      nomeFantasia: "Rede pelo Conhecimento Livre",
      endereco: "Avenida Paulista",
      numero: "37",
      complemento: "Andar 4",
      bairro: "Bela Vista",
      cep: "01311-902",
      cidade: "São Paulo",
      uf: "SP",
      telefone: "(11) 2385-1939",
    });
    expect(resultado.campos).not.toHaveProperty("email");
    expect(Object.keys(resultado.campos)).not.toContain("qsa");
  });

  it("não repete o tipo do logradouro e mantém o e-mail quando ele vem", () => {
    const resultado = mapearRespostaBrasilApi({
      ...receita,
      logradouro: "AVENIDA PAULISTA",
      numero: "S/N",
      email: "contato@exemplo.com",
      ddd_telefone_1: "5511988881001",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.campos.endereco).toBe("Avenida Paulista");
    expect(resultado.campos.numero).toBe("S/N");
    expect(resultado.campos.email).toBe("contato@exemplo.com");
    expect(resultado.campos.telefone).toBe("(11) 98888-1001");
  });

  it("omite nome fantasia, número zero e telefone inválido em vez de apagar o que já foi digitado", () => {
    const resultado = mapearRespostaBrasilApi({
      ...receita,
      nome_fantasia: "",
      numero: "0",
      ddd_telefone_1: "123",
      email: "sem-arroba",
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const preenchido = aplicarCliente(digitado, resultado).valores;
    expect(preenchido.nomeFantasia).toBe("Rascunho");
    expect(preenchido.email).toBe("ana@padaria.test");
    expect(preenchido.numero).toBe("10");
    expect(preenchido.razaoSocial).toBe("Open Knowledge Brasil");
    expect(preenchido.contatoNome).toBe("Ana");
    expect(preenchido.whatsapp).toBe("(13) 98888-1001");
    expect(preenchido.observacoes).toBe("Cliente antigo");
    expect(preenchido.segmentoId).toBe("seg-1");
    expect(preenchido.status).toBe("ATIVO");
  });

  it("atualiza os campos quando chega outro CNPJ válido", () => {
    const primeiro = mapearRespostaBrasilApi(receita);
    const segundo = mapearRespostaBrasilApi({
      ...receita,
      razao_social: "PADARIA DO JOAO LTDA",
      nome_fantasia: "PADARIA DO JOAO",
      municipio: "SANTOS",
      uf: "SP",
      logradouro: "RUA DA PRAIA",
      descricao_tipo_de_logradouro: "RUA",
      numero: "120",
      bairro: "GONZAGA",
      cep: "11060001",
      complemento: "",
    });
    const depoisDoPrimeiro = aplicarCliente(digitado, primeiro);
    const editado = { ...depoisDoPrimeiro.valores, numero: "10-A" };
    const depoisDoSegundo = aplicarCliente(editado, segundo, depoisDoPrimeiro.aplicados);
    expect(depoisDoSegundo.valores.razaoSocial).toBe("Padaria do Joao Ltda");
    expect(depoisDoSegundo.valores.nomeFantasia).toBe("Padaria do Joao");
    expect(depoisDoSegundo.valores.endereco).toBe("Rua da Praia");
    expect(depoisDoSegundo.valores.numero).toBe("120");
    expect(depoisDoSegundo.valores.bairro).toBe("Gonzaga");
    expect(depoisDoSegundo.valores.cep).toBe("11060-001");
    expect(depoisDoSegundo.valores.cidade).toBe("Santos");
    expect(depoisDoSegundo.valores.complemento).toBe("");
    expect(depoisDoSegundo.valores.contatoNome).toBe("Ana");
    expect(depoisDoSegundo.valores.email).toBe("ana@padaria.test");
    expect(depoisDoSegundo.valores.documento).toBe(digitado.documento);
  });

  it("preserva correção manual quando a consulta nova não traz aquele campo", () => {
    const primeiro = aplicarCliente(digitado, mapearRespostaBrasilApi(receita));
    const corrigido = { ...primeiro.valores, complemento: "Fundos" };
    const segundo = aplicarCliente(
      corrigido,
      mapearRespostaBrasilApi({ ...receita, complemento: "", razao_social: "OUTRA LTDA" }),
      primeiro.aplicados,
    );
    expect(segundo.valores.complemento).toBe("Fundos");
    expect(segundo.valores.razaoSocial).toBe("Outra Ltda");
  });
});

describe("estados de erro da consulta", () => {
  it.each([
    ["INAPTA", 4, MENSAGEM_CNPJ_INAPTA, "cnpj_inapta"],
    ["BAIXADA", 8, MENSAGEM_CNPJ_BAIXADA, "cnpj_baixada"],
    ["SUSPENSA", 3, MENSAGEM_CNPJ_SUSPENSA, "cnpj_suspensa"],
    ["NULA", 1, MENSAGEM_CNPJ_NULA, "cnpj_nula"],
  ] as const)("avisa situação %s e mantém o que já foi digitado", (descricao, codigo, mensagem, codigoErro) => {
    const resultado = mapearRespostaBrasilApi({
      ...receita,
      descricao_situacao_cadastral: descricao,
      situacao_cadastral: codigo,
    });
    expect(resultado).toMatchObject({ ok: false, mensagem, codigo: codigoErro, status: 422 });
    expect(aplicarCliente(digitado, resultado).valores).toEqual(digitado);
  });

  it("trata resposta vazia ou sem razão social como falha, sem campos para aplicar", () => {
    expect(mapearRespostaBrasilApi(null)).toMatchObject({
      ok: false,
      mensagem: MENSAGEM_CNPJ_SEM_DADOS,
      codigo: "cnpj_sem_dados",
    });
    expect(mapearRespostaBrasilApi({ descricao_situacao_cadastral: "ATIVA", nome_fantasia: "Só fantasia" })).toMatchObject({
      ok: false,
      mensagem: MENSAGEM_CNPJ_SEM_DADOS,
    });
    expect(aplicarCliente(digitado, mapearRespostaBrasilApi(null)).valores).toEqual(digitado);
  });

  it("reconhece a situação pelo código quando a descrição não vem", () => {
    const semDescricao: Record<string, unknown> = { ...receita, situacao_cadastral: 4 };
    delete semDescricao.descricao_situacao_cadastral;
    expect(mapearRespostaBrasilApi(semDescricao).ok).toBe(false);
    expect(mapearRespostaBrasilApi({ ...semDescricao, situacao_cadastral: 2 }).ok).toBe(true);
  });

  it("não deixa passar detalhe interno nem texto longo demais", () => {
    expect(mensagemVisivelConsulta("Erro em postgres://usuario:senha@localhost/db")).toBe(MENSAGEM_CNPJ_FALHA);
    expect(mensagemVisivelConsulta("getaddrinfo EAI_AGAIN brasilapi.com.br")).toBe(MENSAGEM_CNPJ_FALHA);
    expect(mensagemVisivelConsulta("x".repeat(281))).toBe(MENSAGEM_CNPJ_FALHA);
    expect(mensagemVisivelConsulta(12)).toBe(MENSAGEM_CNPJ_FALHA);
    expect(mensagemVisivelConsulta(MENSAGEM_CNPJ_INAPTA)).toBe(MENSAGEM_CNPJ_INAPTA);
  });
});

describe("quando a tela dispara a consulta", () => {
  const mascarado = "19.131.243/0001-97";
  const outro = completarCnpj("191312430002");

  it("não consulta o CNPJ que já estava na ficha nem o placeholder inválido", () => {
    const salvo = passoConsulta(MEMORIA_CONSULTA, mascarado);
    expect(salvo.passo).toEqual({ tipo: "ocioso" });
    const deNovo = passoConsulta(salvo.memoria, mascarado);
    expect(deNovo.passo).toEqual({ tipo: "ocioso" });

    const placeholder = passoConsulta(MEMORIA_CONSULTA, "00.000.000/0000-00");
    expect(placeholder.passo).toEqual({ tipo: "ocioso" });
  });

  it("consulta ao trocar por outro CNPJ válido e de novo ao voltar", () => {
    const aberto = passoConsulta(MEMORIA_CONSULTA, mascarado).memoria;
    const trocou = passoConsulta(aberto, outro);
    expect(trocou.passo).toEqual({ tipo: "buscar", cnpj: outro });
    const consultado = { ...trocou.memoria, consultado: outro };
    const voltou = passoConsulta(consultado, mascarado);
    expect(voltou.passo).toEqual({ tipo: "buscar", cnpj: CNPJ });
  });

  it("avisa dígito inválido e, no mesmo CNPJ que já deu certo, não busca outra vez", () => {
    let memoria = passoConsulta(MEMORIA_CONSULTA, "").memoria;
    memoria = passoConsulta(memoria, "19.131.243/0001-00").memoria;
    expect(passoConsulta(memoria, "19.131.243/0001-00").passo).toEqual({
      tipo: "erro",
      mensagem: MENSAGEM_CNPJ_INVALIDO,
    });
    const sucesso = passoConsulta({ ...memoria, consultado: CNPJ }, mascarado);
    expect(sucesso.passo).toEqual({ tipo: "repetir" });
  });
});

describe("o que cada formulário recebe", () => {
  const campos: CamposCadastroCnpj = {
    razaoSocial: "Open Knowledge Brasil",
    nomeFantasia: "Rede pelo Conhecimento Livre",
    endereco: "Avenida Paulista",
    numero: "37",
    complemento: "Andar 4",
    bairro: "Bela Vista",
    cep: "01311-902",
    cidade: "São Paulo",
    uf: "SP",
    email: "contato@exemplo.com",
    telefone: "(11) 2385-1939",
  };

  it("manda ao cliente só os campos que a ficha já tem", () => {
    expect(camposDoCliente(campos)).toEqual({
      nomeFantasia: "Rede pelo Conhecimento Livre",
      razaoSocial: "Open Knowledge Brasil",
      endereco: "Avenida Paulista",
      numero: "37",
      complemento: "Andar 4",
      bairro: "Bela Vista",
      cep: "01311-902",
      cidade: "São Paulo",
      uf: "SP",
      email: "contato@exemplo.com",
    });
    expect(camposDoCliente(campos)).not.toHaveProperty("telefone");
    expect(camposDoCliente(campos)).not.toHaveProperty("whatsapp");
    expect(camposDoCliente(campos)).not.toHaveProperty("contatoNome");
  });

  it("na empresa reaproveita razão social, nome fantasia, e-mail e telefone", () => {
    expect(camposDaEmpresa(campos)).toEqual({
      nomeFantasia: "Rede pelo Conhecimento Livre",
      razaoSocial: "Open Knowledge Brasil",
      emailContato: "contato@exemplo.com",
      telefone: "(11) 2385-1939",
    });
    const empresa = {
      razaoSocial: "Antiga",
      nomeFantasia: "Antiga",
      cnpj: CNPJ,
      emailContato: "dono@empresa.test",
      telefone: "(13) 3333-1001",
    };
    expect(mesclarCadastro(empresa, camposDaEmpresa({ razaoSocial: "Nova Ltda" }))).toEqual({
      ...empresa,
      razaoSocial: "Nova Ltda",
    });
  });

  it("relê a resposta da rota e descarta campo malformado", () => {
    expect(
      lerCamposCadastro({
        razaoSocial: "Padaria",
        cep: "01311902",
        email: "nao-e-email",
        telefone: "123",
        uf: "XX",
      }),
    ).toEqual({
      razaoSocial: "Padaria",
      cep: "01311-902",
    });
    expect(lerCamposCadastro({ email: "contato@exemplo.com" })).toBeNull();
  });
});
