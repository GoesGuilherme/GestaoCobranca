import { z } from "zod";
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

export const esquemaLogin = z.object({
  email: z.string().trim().min(1, "Informe o e-mail."),
  senha: z.string().min(1, "Informe a senha."),
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
  status: z.enum(["ATIVO", "INATIVO", "EM_IMPLANTACAO"], "Escolha o status."),
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

export type EntradaCliente = z.infer<typeof esquemaCliente>;
export type EntradaFilial = z.infer<typeof esquemaFilial>;
