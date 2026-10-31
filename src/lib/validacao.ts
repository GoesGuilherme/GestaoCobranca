import { z } from "zod";
import { MODELO_ASSUNTO_PADRAO, MODELO_MENSAGEM_PADRAO } from "./cobranca";
import { dataHojeIso, dataIsoValida } from "./data";
import { normalizarAliquota, normalizarDinheiro } from "./dinheiro";
import { cnpjValido, identificarDocumento, whatsappValido } from "./documento";
import { ufValida } from "./ufs";

export function mensagensDoZod(erro: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const issue of erro.issues) {
    const chave = String(issue.path[0] ?? "");
    if (chave && !campos[chave]) campos[chave] = issue.message;
  }
  return campos;
}

export function mensagemDoCampo(esquema: z.ZodType, valor: unknown): string {
  const resultado = esquema.safeParse(valor);
  if (resultado.success) return "";
  return resultado.error.issues[0]?.message ?? "Revise este campo.";
}

export const esquemaLogin = z.object({
  email: z.string().trim().min(1, "Informe o e-mail."),
  senha: z.string().min(1, "Informe a senha."),
});

export const esquemaEsqueciSenha = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe o e-mail.")
    .refine((valor) => z.email().safeParse(valor).success, "Informe um e-mail válido.")
    .max(160, "O e-mail pode ter no máximo 160 caracteres."),
});

export const esquemaCliente = z.object({
  nomeFantasia: z
    .string()
    .trim()
    .min(2, "Informe o nome fantasia.")
    .max(120, "O nome fantasia pode ter no máximo 120 caracteres."),
  razaoSocial: z
    .string()
    .trim()
    .min(2, "Informe a razão social.")
    .max(160, "A razão social pode ter no máximo 160 caracteres."),
  documento: z
    .string()
    .trim()
    .min(1, "Informe o CPF ou CNPJ.")
    .refine((valor) => identificarDocumento(valor) !== null, "Informe um CPF ou CNPJ válido."),
  segmento: z.enum(["RESTAURANTE", "MERCADO_AUTONOMO", "OUTRO"], "Escolha o segmento."),
  contatoNome: z
    .string()
    .trim()
    .min(2, "Informe o nome do contato principal.")
    .max(120, "O nome do contato pode ter no máximo 120 caracteres."),
  whatsapp: z
    .string()
    .trim()
    .min(1, "Informe o WhatsApp.")
    .refine((valor) => whatsappValido(valor), "Informe um WhatsApp válido com DDD."),
  email: z
    .string()
    .trim()
    .min(1, "Informe o e-mail.")
    .refine((valor) => z.email().safeParse(valor).success, "Informe um e-mail válido.")
    .max(160, "O e-mail pode ter no máximo 160 caracteres."),
  cidade: z
    .string()
    .trim()
    .min(2, "Informe a cidade.")
    .max(80, "A cidade pode ter no máximo 80 caracteres."),
  uf: z
    .string()
    .trim()
    .min(1, "Escolha a UF.")
    .refine((valor) => ufValida(valor), "Escolha uma UF válida."),
  status: z.enum(["ATIVO", "INATIVO", "EM_IMPLANTACAO", "BLOQUEADO"], "Escolha o status."),
  ativadoEm: z
    .string()
    .trim()
    .default("")
    .refine((valor) => valor === "" || dataIsoValida(valor), "Informe uma data de ativação válida.")
    .refine((valor) => valor === "" || valor <= dataHojeIso(), "A data de ativação não pode ser futura."),
  observacoes: z
    .string()
    .trim()
    .max(2000, "As observações podem ter no máximo 2000 caracteres.")
    .optional(),
});

export const esquemaFilial = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome da filial.")
    .max(120, "O nome da filial pode ter no máximo 120 caracteres."),
  cnpj: z
    .string()
    .trim()
    .min(1, "Informe o CNPJ da filial.")
    .refine((valor) => cnpjValido(valor), "Informe um CNPJ válido."),
  endereco: z
    .string()
    .trim()
    .min(5, "Informe o endereço.")
    .max(180, "O endereço pode ter no máximo 180 caracteres."),
  cidade: z
    .string()
    .trim()
    .min(2, "Informe a cidade.")
    .max(80, "A cidade pode ter no máximo 80 caracteres."),
  uf: z
    .string()
    .trim()
    .min(1, "Escolha a UF.")
    .refine((valor) => ufValida(valor), "Escolha uma UF válida."),
  status: z.enum(["ATIVA", "INATIVA", "EM_IMPLANTACAO"], "Escolha o status."),
  observacoes: z
    .string()
    .trim()
    .max(2000, "As observações podem ter no máximo 2000 caracteres.")
    .optional(),
});

const email = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .refine((valor) => z.email().safeParse(valor).success, "Informe um e-mail válido.")
  .max(160, "O e-mail pode ter no máximo 160 caracteres.");

const senhaNova = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");

export const esquemaDadosEmpresa = z.object({
  razaoSocial: z
    .string()
    .trim()
    .min(2, "Informe a razão social.")
    .max(160, "A razão social pode ter no máximo 160 caracteres."),
  nomeFantasia: z
    .string()
    .trim()
    .min(2, "Informe o nome fantasia.")
    .max(120, "O nome fantasia pode ter no máximo 120 caracteres."),
  cnpj: z
    .string()
    .trim()
    .min(1, "Informe o CNPJ.")
    .refine((valor) => cnpjValido(valor), "Informe um CNPJ válido."),
  emailContato: email,
  telefone: z
    .string()
    .trim()
    .min(1, "Informe o telefone.")
    .refine((valor) => whatsappValido(valor), "Informe um telefone válido com DDD."),
});

export const esquemaRedefinirSenha = z
  .object({
    token: z.string().trim().min(20, "Este link não vale mais. Peça outro.").max(200),
    senha: senhaNova,
    confirmacao: z.string(),
  })
  .refine((valor) => valor.senha === valor.confirmacao, {
    path: ["confirmacao"],
    message: "A confirmação não confere com a senha.",
  });

export const esquemaCadastroEmpresa = esquemaDadosEmpresa.extend({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome de quem vai administrar.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  email,
  senha: senhaNova,
});

export const esquemaCadastroAdmin = esquemaCadastroEmpresa.extend({
  plano: z
    .string()
    .trim()
    .min(2, "Informe o plano.")
    .max(40, "O plano pode ter no máximo 40 caracteres.")
    .optional(),
});

export const esquemaNovoUsuario = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  email,
  senha: senhaNova,
  papel: z.enum(["DONO", "FINANCEIRO", "SUPORTE"], "Escolha o papel."),
});

export const esquemaStatusEmpresa = z.object({
  status: z.enum(["ATIVA", "SUSPENSA"], "Escolha o status."),
});

export const esquemaValor = z.preprocess(
  (valor) => {
    if (typeof valor === "number" && Number.isFinite(valor)) return valor.toFixed(2);
    if (typeof valor === "string") return valor;
    return "";
  },
  z
    .string()
    .trim()
    .min(1, "Informe o valor.")
    .refine((valor) => normalizarDinheiro(valor) !== null, "Informe um valor em reais, como 189,90.")
    .transform((valor) => normalizarDinheiro(valor)!),
);

const esquemaAtivo = z.preprocess(
  (valor) => {
    if (valor === true || valor === "true") return true;
    if (valor === false || valor === "false") return false;
    return valor;
  },
  z.boolean("Informe se o serviço está ativo."),
);

function vazioComoNulo(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string" && valor.trim() === "") return null;
  return valor;
}

export const esquemaCustoOpcional = z.preprocess(
  (valor) => {
    const tratado = vazioComoNulo(valor);
    if (tratado === null) return null;
    if (typeof tratado === "number" && Number.isFinite(tratado)) return tratado.toFixed(2);
    return tratado;
  },
  z.union([
    z.null(),
    z
      .string()
      .trim()
      .refine(
        (valor) => normalizarDinheiro(valor) !== null,
        "Informe o custo em reais, como 40,00, ou deixe em branco.",
      )
      .transform((valor) => normalizarDinheiro(valor)!),
  ]),
);

export const esquemaAliquotaOpcional = z.preprocess(
  (valor) => {
    const tratado = vazioComoNulo(valor);
    if (tratado === null) return null;
    if (typeof tratado === "number" && Number.isFinite(tratado)) return tratado.toFixed(2);
    return tratado;
  },
  z.union([
    z.null(),
    z
      .string()
      .trim()
      .refine(
        (valor) => normalizarAliquota(valor) !== null,
        "Informe a alíquota de 0 a 100, como 5 ou 5,5, ou deixe em branco.",
      )
      .transform((valor) => normalizarAliquota(valor)!),
  ]),
);

export const esquemaServico = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome do serviço.")
    .max(120, "O nome do serviço pode ter no máximo 120 caracteres."),
  descricao: z
    .string()
    .trim()
    .max(2000, "A descrição pode ter no máximo 2000 caracteres.")
    .optional(),
  precoPadrao: esquemaValor,
  custo: esquemaCustoOpcional,
  aliquotaImposto: esquemaAliquotaOpcional,
  ativo: esquemaAtivo,
});

export const esquemaClienteServico = z.object({
  servicoId: z
    .string()
    .trim()
    .min(1, "Escolha o serviço.")
    .max(64, "Escolha um serviço do catálogo."),
  valor: esquemaValor,
  custo: esquemaCustoOpcional,
  recorrencia: z.enum(["MENSAL", "AVULSO"], "Escolha se a cobrança é mensal ou avulsa."),
  inicioEm: z
    .string()
    .trim()
    .refine((valor) => dataIsoValida(valor), "Informe a data de início."),
  status: z.enum(["ATIVO", "INATIVO"], "Escolha a situação."),
  observacoes: z
    .string()
    .trim()
    .max(2000, "As observações podem ter no máximo 2000 caracteres.")
    .optional(),
});

export const esquemaValorPositivo = esquemaValor.refine(
  (valor) => valor !== "0.00",
  "Informe um valor maior que zero.",
);

export const esquemaConfiguracaoAsaas = z.object({
  ambiente: z.enum(["SANDBOX", "PRODUCAO"], "Escolha sandbox ou produção."),
  chaveApi: z.preprocess(
    (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor),
    z
      .string()
      .trim()
      .min(20, "A chave da API parece incompleta.")
      .max(400, "A chave da API passa do tamanho esperado.")
      .refine((valor) => !/\s/.test(valor), "A chave da API não pode ter espaço.")
      .optional(),
  ),
});

export const esquemaFatura = z.object({
  valor: esquemaValorPositivo,
  vencimento: z
    .string()
    .trim()
    .refine((valor) => dataIsoValida(valor), "Informe o vencimento."),
  formaCobranca: z
    .enum(["BOLETO", "PIX", "UNDEFINED", "CREDIT_CARD"], "Escolha boleto, Pix, cartão ou deixar o cliente escolher.")
    .optional(),
  descricao: z
    .string()
    .trim()
    .max(500, "A descrição pode ter no máximo 500 caracteres.")
    .optional(),
  clienteServicoId: z
    .string()
    .trim()
    .max(64, "Escolha um serviço deste cliente.")
    .optional(),
  chaveIdempotencia: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{8,64}$/, "A tentativa de emissão é inválida.")
    .optional(),
});

export type EntradaCliente = z.infer<typeof esquemaCliente>;
export type EntradaFilial = z.infer<typeof esquemaFilial>;
export type EntradaDadosEmpresa = z.infer<typeof esquemaDadosEmpresa>;
export type EntradaCadastroEmpresa = z.infer<typeof esquemaCadastroEmpresa>;
export type EntradaNovoUsuario = z.infer<typeof esquemaNovoUsuario>;
export type EntradaServico = z.infer<typeof esquemaServico>;
export type EntradaClienteServico = z.infer<typeof esquemaClienteServico>;
export type EntradaConfiguracaoAsaas = z.infer<typeof esquemaConfiguracaoAsaas>;
export const esquemaDiaVencimento = z
  .number("Informe o dia de vencimento.")
  .int("Informe o dia de vencimento.")
  .min(1, "O dia de vencimento fica entre 1 e 31.")
  .max(31, "O dia de vencimento fica entre 1 e 31.");

const esquemaFormaCobranca = z.enum(
  ["BOLETO", "PIX", "UNDEFINED", "CREDIT_CARD"],
  "Escolha boleto, Pix, cartão ou deixar o cliente escolher.",
);

const esquemaDiasDesconto = z.preprocess(
  (valor) => {
    if (valor === null || valor === undefined) return null;
    if (typeof valor === "string" && valor.trim() === "") return null;
    if (typeof valor === "string" && /^\d+$/.test(valor.trim())) return Number(valor.trim());
    return valor;
  },
  z.union([
    z.null(),
    z
      .number("Os dias do desconto ficam entre 0 e 30.")
      .int("Os dias do desconto ficam entre 0 e 30.")
      .min(0, "Os dias do desconto ficam entre 0 e 30.")
      .max(30, "Os dias do desconto ficam entre 0 e 30."),
  ]),
);

const esquemaDiasAntesGerar = z.preprocess(
  (valor) => {
    if (valor === null || valor === undefined) return null;
    if (typeof valor === "string" && valor.trim() === "") return null;
    if (typeof valor === "string" && /^\d+$/.test(valor.trim())) return Number(valor.trim());
    return valor;
  },
  z.union([
    z.null(),
    z
      .number("A antecipação fica em branco ou em 7, 14 ou 40 dias.")
      .int("A antecipação fica em branco ou em 7, 14 ou 40 dias.")
      .refine((dias) => dias === 7 || dias === 14 || dias === 40, "A antecipação fica em branco ou em 7, 14 ou 40 dias."),
  ]),
);

const esquemaTextoCobranca = z
  .string()
  .trim()
  .max(500, "A descrição pode ter no máximo 500 caracteres.");

const camposEncargos = {
  multaPercentual: esquemaAliquotaOpcional.optional(),
  jurosPercentual: esquemaAliquotaOpcional.optional(),
  descontoPercentual: esquemaAliquotaOpcional.optional(),
  descontoDiasAntes: esquemaDiasDesconto.optional(),
};

export const esquemaAtivarRecorrencia = z.object({
  formaCobranca: esquemaFormaCobranca.optional(),
  diaVencimento: esquemaDiaVencimento.optional(),
  proximoVencimento: z
    .string()
    .trim()
    .refine((valor) => dataIsoValida(valor), "Informe o primeiro vencimento.")
    .optional(),
  valor: esquemaValorPositivo.optional(),
  descricao: esquemaTextoCobranca.optional(),
  modeloDescricao: esquemaTextoCobranca.optional(),
  ...camposEncargos,
});

export const esquemaEditarRecorrencia = z.object({
  formaCobranca: esquemaFormaCobranca.optional(),
  diaVencimento: esquemaDiaVencimento,
  proximoVencimento: z
    .string()
    .trim()
    .refine((valor) => dataIsoValida(valor), "Informe o próximo vencimento.")
    .optional(),
  valor: esquemaValorPositivo,
  descricao: esquemaTextoCobranca.optional(),
  atualizarPendentes: z.boolean().optional(),
  ...camposEncargos,
});

export const esquemaRetomarRecorrencia = z.object({
  diaVencimento: esquemaDiaVencimento.optional(),
  proximoVencimento: z
    .string()
    .trim()
    .refine((valor) => dataIsoValida(valor), "Informe o próximo vencimento.")
    .optional(),
});

export const esquemaLoteRecorrencia = z
  .object({
    diaVencimento: esquemaDiaVencimento,
    formaCobranca: esquemaFormaCobranca.optional(),
    modeloDescricao: esquemaTextoCobranca.optional(),
    clienteId: z.string().trim().max(64).optional(),
    todos: z.boolean().optional(),
    ids: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
    ...camposEncargos,
  })
  .refine((dados) => dados.todos === true || (dados.ids?.length ?? 0) > 0, "Escolha ao menos uma venda mensal.");

export const esquemaPreferenciasCobranca = z.object({
  formaCobranca: esquemaFormaCobranca,
  diaVencimento: esquemaDiaVencimento,
  modeloDescricao: esquemaTextoCobranca.min(1, "Informe o modelo da descrição."),
  multaPercentual: esquemaAliquotaOpcional,
  jurosPercentual: esquemaAliquotaOpcional,
  descontoPercentual: esquemaAliquotaOpcional,
  descontoDiasAntes: esquemaDiasDesconto,
  diasAntesGerar: esquemaDiasAntesGerar,
  atualizarPendentes: z.boolean("Informe se as cobranças em aberto devem ser atualizadas."),
  modeloMensagem: z
    .string()
    .trim()
    .min(1, "Informe a mensagem para o cliente.")
    .max(2000, "A mensagem pode ter no máximo 2000 caracteres.")
    .default(MODELO_MENSAGEM_PADRAO),
  modeloAssunto: z
    .string()
    .trim()
    .min(1, "Informe o assunto do e-mail.")
    .max(200, "O assunto pode ter no máximo 200 caracteres.")
    .default(MODELO_ASSUNTO_PADRAO),
});

const esquemaEmailOpcional = z
  .string()
  .trim()
  .max(160, "O e-mail pode ter no máximo 160 caracteres.")
  .refine((valor) => valor === "" || (valor.includes("@") && !/\s/.test(valor) && valor.length >= 3), "Informe um e-mail válido.");

export const esquemaPassoRegua = z
  .object({
    id: z.preprocess(
      (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor),
      z.string().trim().min(1).max(64).optional(),
    ),
    naEmissao: z.boolean("Informe se o passo é na emissão."),
    dias: z.number().int().min(-365).max(365).nullable(),
    canal: z.enum(["EMAIL"], "O e-mail continua na régua. O WhatsApp sai junto, no mesmo passo, se estiver marcado."),
    enviarWhatsapp: z.boolean().optional().default(false),
    assunto: z.string().trim().min(1, "Informe o assunto.").max(200, "O assunto pode ter no máximo 200 caracteres."),
    corpo: z.string().trim().min(1, "Informe o texto.").max(2000, "O texto pode ter no máximo 2000 caracteres."),
  })
  .refine(
    (passo) => (passo.naEmissao && passo.dias === null) || (!passo.naEmissao && passo.dias !== null),
    "Na emissão não usa dias. Os outros passos informam os dias em relação ao vencimento.",
  );

export const esquemaRegua = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome da régua.").max(60, "O nome pode ter no máximo 60 caracteres."),
    padrao: z.boolean("Informe se esta é a régua padrão."),
    horaInicio: z.number().int().min(0).max(23),
    horaFim: z.number().int().min(0).max(23),
    enviarFimDeSemana: z.boolean("Informe se a régua envia no fim de semana."),
    passos: z.array(esquemaPassoRegua).max(20, "Uma régua pode ter no máximo 20 passos."),
  })
  .refine((regua) => regua.horaInicio < regua.horaFim, "A hora final precisa ser depois da hora inicial.");

export const esquemaConfiguracaoRegua = z.object({
  ativa: z.boolean("Informe se a régua está ligada."),
  modoTeste: z.boolean("Informe se o modo teste está ligado."),
  remetenteNome: z.string().trim().max(80, "O nome do remetente pode ter no máximo 80 caracteres."),
  remetenteEmail: esquemaEmailOpcional,
  replyTo: esquemaEmailOpcional,
  chaveResend: z.preprocess(
    (valor) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor),
    z
      .string()
      .trim()
      .min(10, "A chave da Resend parece incompleta.")
      .max(200, "A chave da Resend passa do tamanho esperado.")
      .refine((valor) => !/\s/.test(valor), "A chave da Resend não pode ter espaço.")
      .optional(),
  ),
});

export const esquemaConexaoTwilio = z.object({
  telefone: z
    .string()
    .trim()
    .min(8, "Informe o WhatsApp do remetente.")
    .max(20, "O WhatsApp do remetente está longo demais."),
  nomeExibicao: z
    .string()
    .trim()
    .min(2, "Informe o nome que aparece no WhatsApp.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  wabaId: z
    .string()
    .trim()
    .max(32, "O WABA ID está longo demais.")
    .refine((valor) => valor === "" || /^\d{5,20}$/.test(valor), "O WABA ID é numérico, se a Twilio já tiver informado.")
    .optional()
    .default(""),
  coexistencia: z.boolean("Informe se quer pedir coexistência com o app WhatsApp Business."),
});

export const esquemaCodigoTwilio = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, "Informe o código numérico que chegou no telefone."),
});

export const esquemaAtribuicaoRegua = z
  .object({
    modo: z.enum(["PADRAO", "ESPECIFICA", "NENHUMA"], "Escolha a régua do cliente."),
    reguaId: z.string().trim().min(1).max(64).nullable().optional(),
    pausada: z.boolean("Informe se a régua deste cliente está pausada."),
  })
  .refine((dados) => dados.modo !== "ESPECIFICA" || Boolean(dados.reguaId), "Escolha qual régua este cliente usa.");

export const esquemaLembreteManual = z.object({
  passoId: z.string().trim().min(1, "Escolha o passo.").max(64),
});

export type EntradaFatura = z.infer<typeof esquemaFatura>;
export type EntradaAtivarRecorrencia = z.infer<typeof esquemaAtivarRecorrencia>;
export type EntradaEditarRecorrencia = z.infer<typeof esquemaEditarRecorrencia>;
export type EntradaRetomarRecorrencia = z.infer<typeof esquemaRetomarRecorrencia>;
export type EntradaLoteRecorrencia = z.infer<typeof esquemaLoteRecorrencia>;
export type EntradaPreferenciasCobranca = z.infer<typeof esquemaPreferenciasCobranca>;
