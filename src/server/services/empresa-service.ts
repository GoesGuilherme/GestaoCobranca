import { cnpjCollabPendente } from "@/lib/collab";
import { formatarCnpj, formatarWhatsapp, somenteDigitos, somenteDocumento } from "@/lib/documento";
import type { EmpresaResumo } from "@/lib/tipos";
import {
  esquemaCadastroAdmin,
  esquemaCadastroEmpresa,
  esquemaDadosEmpresa,
  type EntradaCadastroEmpresa,
  type EntradaDadosEmpresa,
} from "@/lib/validacao";
import type { Acesso } from "@/server/auth/acesso";
import { exigirDono } from "@/server/auth/acesso";
import { gerarHashSenha } from "@/server/auth/senha";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";

const JANELA_MS = 60 * 60 * 1000;
const LIMITE_POR_IP = 5;
const LIMITE_POR_EMAIL = 3;

function cnpjNormalizado(valor: string): string {
  return somenteDocumento(valor);
}

function paraEmpresa(
  empresa: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string;
    cnpj: string;
    emailContato: string;
    telefone: string;
    status: "ATIVA" | "SUSPENSA";
    plano: string;
    criadoEm: Date;
    _count?: { usuarios: number; clientes: number };
  },
): EmpresaResumo {
  return {
    id: empresa.id,
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    cnpj: cnpjCollabPendente(empresa.cnpj) ? empresa.cnpj : formatarCnpj(empresa.cnpj),
    emailContato: empresa.emailContato,
    telefone: empresa.telefone ? formatarWhatsapp(empresa.telefone) : "",
    status: empresa.status,
    plano: empresa.plano,
    quantidadeUsuarios: empresa._count?.usuarios ?? 0,
    quantidadeClientes: empresa._count?.clientes ?? 0,
    criadoEm: empresa.criadoEm.toISOString(),
  };
}

function dadosEmpresa(entrada: EntradaDadosEmpresa | EntradaCadastroEmpresa) {
  return {
    razaoSocial: entrada.razaoSocial,
    nomeFantasia: entrada.nomeFantasia,
    cnpj: cnpjNormalizado(entrada.cnpj),
    emailContato: entrada.emailContato.toLowerCase(),
    telefone: somenteDigitos(entrada.telefone),
  };
}

async function garantirLimite(ip: string | null, email: string) {
  const desde = new Date(Date.now() - JANELA_MS);
  await prisma.limiteCadastro.deleteMany({
    where: { criadoEm: { lt: new Date(Date.now() - 24 * JANELA_MS) } },
  });

  const porEmail = await prisma.limiteCadastro.count({
    where: { chave: `email:${email}`, criadoEm: { gte: desde } },
  });
  const porIp = ip
    ? await prisma.limiteCadastro.count({
        where: { chave: `ip:${ip}`, criadoEm: { gte: desde } },
      })
    : 0;

  if (porEmail >= LIMITE_POR_EMAIL || (ip && porIp >= LIMITE_POR_IP)) {
    throw new ErroAplicacao(
      "Muitas tentativas de cadastro. Tente de novo mais tarde.",
      429,
      "limite_cadastro",
    );
  }

  await prisma.limiteCadastro.createMany({
    data: [
      { chave: `email:${email}` },
      ...(ip ? [{ chave: `ip:${ip}` }] : []),
    ],
  });
}

async function criarEmpresaEDono(
  entrada: EntradaCadastroEmpresa,
  plano: string,
) {
  const empresaDados = dadosEmpresa(entrada);
  const email = entrada.email.toLowerCase();

  try {
    return await prisma.$transaction(async (tx) => {
      const cnpjUsado = await tx.empresa.findUnique({ where: { cnpj: empresaDados.cnpj } });
      if (cnpjUsado) {
        throw new ErroAplicacao("Já existe uma empresa com este CNPJ.", 409, "cnpj_duplicado", {
          cnpj: "Já existe uma empresa com este CNPJ.",
        });
      }
      const emailUsado = await tx.usuario.findUnique({ where: { email } });
      if (emailUsado) {
        throw new ErroAplicacao("Já existe um acesso com este e-mail.", 409, "email_duplicado", {
          email: "Já existe um acesso com este e-mail.",
        });
      }

      const empresa = await tx.empresa.create({
        data: { ...empresaDados, plano, status: "ATIVA" },
      });
      await tx.usuario.create({
        data: {
          nome: entrada.nome,
          email,
          senhaHash: await gerarHashSenha(entrada.senha),
          empresaId: empresa.id,
          papel: "DONO",
          superadministrador: false,
        },
      });
      return empresa;
    });
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    if (codigoPrisma(erro) === "P2002") {
      throw new ErroAplicacao(
        "Já existe uma empresa ou um acesso com estes dados.",
        409,
        "duplicado",
      );
    }
    throw erro;
  }
}

export async function cadastrarEmpresaPublica(entrada: unknown, ip: string | null) {
  const dados = lerEsquema(esquemaCadastroEmpresa, entrada);
  await garantirLimite(ip, dados.email.toLowerCase());
  const empresa = await criarEmpresaEDono(dados, "basico");
  return obterEmpresa(empresa.id);
}

export async function cadastrarEmpresaPeloAdmin(entrada: unknown) {
  const dados = lerEsquema(esquemaCadastroAdmin, entrada);
  const empresa = await criarEmpresaEDono(dados, dados.plano?.trim() || "basico");
  return obterEmpresa(empresa.id);
}

const incluirContagem = { _count: { select: { usuarios: true, clientes: true } } } as const;

export async function listarEmpresas(): Promise<EmpresaResumo[]> {
  const empresas = await prisma.empresa.findMany({
    include: incluirContagem,
    orderBy: { nomeFantasia: "asc" },
  });
  return empresas.map(paraEmpresa);
}

export async function obterEmpresa(empresaId: string): Promise<EmpresaResumo> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    include: incluirContagem,
  });
  if (!empresa) {
    throw new ErroAplicacao("Empresa não encontrada.", 404, "nao_encontrado");
  }
  return paraEmpresa(empresa);
}

export async function atualizarEmpresa(
  acesso: Acesso,
  entrada: unknown,
): Promise<EmpresaResumo> {
  exigirDono(acesso);
  const dados = dadosEmpresa(lerEsquema(esquemaDadosEmpresa, entrada));
  const outra = await prisma.empresa.findFirst({
    where: { cnpj: dados.cnpj, NOT: { id: acesso.empresaId } },
  });
  if (outra) {
    throw new ErroAplicacao("Já existe uma empresa com este CNPJ.", 409, "cnpj_duplicado", {
      cnpj: "Já existe uma empresa com este CNPJ.",
    });
  }

  await prisma.empresa.update({
    where: { id: acesso.empresaId },
    data: dados,
  });
  return obterEmpresa(acesso.empresaId);
}

export async function alterarStatusEmpresa(
  acesso: Acesso,
  empresaId: string,
  status: "ATIVA" | "SUSPENSA",
): Promise<EmpresaResumo> {
  if (status === "SUSPENSA" && empresaId === acesso.empresaId) {
    throw new ErroAplicacao(
      "Você não pode suspender a própria empresa.",
      400,
      "suspensao_propria",
    );
  }
  const existente = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!existente) {
    throw new ErroAplicacao("Empresa não encontrada.", 404, "nao_encontrado");
  }
  await prisma.empresa.update({ where: { id: empresaId }, data: { status } });
  return obterEmpresa(empresaId);
}

function codigoPrisma(erro: unknown): string | undefined {
  if (typeof erro === "object" && erro && "code" in erro && typeof erro.code === "string") {
    return erro.code;
  }
  return undefined;
}
