export type ModoGravacao = "criar" | "editar";

/** Criação volta ao estado inicial. Edição mantém o que acabou de ser salvo. */
export function valoresAposSalvar<T>(modo: ModoGravacao, atuais: T, iniciais: T): T {
  return modo === "criar" ? iniciais : atuais;
}

export const CLIENTE_VAZIO = {
  nomeFantasia: "",
  razaoSocial: "",
  documento: "",
  segmento: "RESTAURANTE",
  contatoNome: "",
  whatsapp: "",
  email: "",
  cidade: "",
  uf: "SP",
  status: "ATIVO",
  ativadoEm: "",
  observacoes: "",
};

export const USUARIO_NOVO = {
  nome: "",
  email: "",
  senha: "",
  papel: "SUPORTE" as const,
};

export const EMPRESA_ADMIN_VAZIA = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  emailContato: "",
  telefone: "",
  nome: "",
  email: "",
  senha: "",
  plano: "basico",
};

export const SERVICO_NOVO = {
  nome: "",
  descricao: "",
  precoPadrao: "",
  custo: "",
  aliquotaImposto: "",
  ativo: "true",
};

export function filialNova(cidade = "", uf = "SP") {
  return {
    nome: "",
    cnpj: "",
    endereco: "",
    cidade,
    uf,
    status: "ATIVA",
    whatsapp: "",
    observacoes: "",
  };
}

export function faturaInicial(formaCobranca: string, hoje: string) {
  return {
    valor: "",
    vencimento: hoje,
    formaCobranca,
    descricao: "",
    clienteServicoId: "",
  };
}

export function vinculoNovo(parcial?: Partial<ReturnType<typeof vinculoBase>>) {
  return { ...vinculoBase(), ...parcial };
}

function vinculoBase() {
  return {
    servicoId: "",
    valor: "",
    custo: "",
    recorrencia: "MENSAL",
    inicioEm: "",
    status: "ATIVO",
    observacoes: "",
  };
}

/** A chave não volta para o campo. O ambiente escolhido permanece. */
export function asaasAposSalvar(ambiente: string) {
  return { ambiente, chaveApi: "" };
}

export type PoliticaFormulario = {
  formulario: string;
  modo: ModoGravacao;
};

export const POLITICA_FORMULARIOS: PoliticaFormulario[] = [
  { formulario: "Novo cliente", modo: "criar" },
  { formulario: "Editar cliente", modo: "editar" },
  { formulario: "Nova fatura", modo: "criar" },
  { formulario: "Novo usuário", modo: "criar" },
  { formulario: "Nova empresa (admin)", modo: "criar" },
  { formulario: "Dados da empresa", modo: "editar" },
  { formulario: "Nova filial", modo: "criar" },
  { formulario: "Editar filial", modo: "editar" },
  { formulario: "Novo serviço", modo: "criar" },
  { formulario: "Editar serviço", modo: "editar" },
  { formulario: "Vender serviço", modo: "criar" },
  { formulario: "Editar serviço vendido", modo: "editar" },
  { formulario: "Nova régua", modo: "criar" },
  { formulario: "Passos da régua", modo: "editar" },
  { formulario: "Envio da régua", modo: "editar" },
  { formulario: "Régua do cliente", modo: "editar" },
  { formulario: "WhatsApp / Twilio", modo: "editar" },
  { formulario: "Código do WhatsApp", modo: "criar" },
  { formulario: "Asaas", modo: "editar" },
  { formulario: "Preferências e templates de cobrança", modo: "editar" },
  { formulario: "Assessor", modo: "editar" },
  { formulario: "Resposta do assessor", modo: "criar" },
  { formulario: "Recorrência", modo: "editar" },
];
