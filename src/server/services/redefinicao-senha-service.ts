import {
  MENSAGEM_LINK_INVALIDO,
  MENSAGEM_REDEFINICAO_ENVIADA,
  montarEmailRedefinicao,
  VALIDADE_REDEFINICAO_MS,
} from "@/lib/redefinicao-senha";
import { hashTokenRedefinicao, novoTokenRedefinicao } from "@/server/auth/token-redefinicao";
import { esquemaEsqueciSenha, esquemaRedefinirSenha } from "@/lib/validacao";
import { descreverRemetenteAusente, enviarEmailAuth, lerRemetenteAuth, type EmailAuth } from "@/server/auth/email-auth";
import { gerarHashSenha } from "@/server/auth/senha";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";

const JANELA_MS = 60 * 60 * 1000;
const LIMITE_POR_EMAIL = 5;
const LIMITE_POR_IP = 20;

type Pedido = {
  ip: string | null;
  origem: string;
  agora?: Date;
  remetente?: { chave: string; de: string } | null;
  enviar?: (dados: EmailAuth) => Promise<void>;
};

export async function pedirRedefinicaoSenha(entrada: unknown, pedido: Pedido): Promise<{ mensagem: string }> {
  const dados = lerEsquema(esquemaEsqueciSenha, entrada);
  const remetente = pedido.remetente === undefined ? lerRemetenteAuth() : pedido.remetente;
  if (!remetente) {
    console.error(`Redefinição de senha indisponível: ${descreverRemetenteAusente()} Nenhum link foi gerado.`);
    throw new ErroAplicacao(
      "Não foi possível enviar o e-mail agora. Tente de novo mais tarde.",
      503,
      "remetente_ausente",
    );
  }

  const email = dados.email.toLowerCase();
  await garantirLimite(pedido.ip, email);

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) return { mensagem: MENSAGEM_REDEFINICAO_ENVIADA };

  const agora = pedido.agora ?? new Date();
  const { token, tokenHash } = novoTokenRedefinicao();
  await prisma.$transaction(async (tx) => {
    await tx.redefinicaoSenha.updateMany({
      where: { usuarioId: usuario.id, usadoEm: null },
      data: { usadoEm: agora },
    });
    await tx.redefinicaoSenha.create({
      data: {
        usuarioId: usuario.id,
        tokenHash,
        expiraEm: new Date(agora.getTime() + VALIDADE_REDEFINICAO_MS),
      },
    });
  });

  const link = `${pedido.origem.replace(/\/$/, "")}/redefinir-senha?token=${encodeURIComponent(token)}`;
  const carta = montarEmailRedefinicao(link);
  try {
    await (pedido.enviar ?? enviarEmailAuth)({
      de: remetente.de,
      chave: remetente.chave,
      para: usuario.email,
      ...carta,
    });
  } catch (erro) {
    await prisma.redefinicaoSenha.deleteMany({ where: { tokenHash } });
    const detalhe = erro instanceof ErroAplicacao ? erro.codigo : "falha";
    console.error(`Falha ao enviar o e-mail de redefinição de senha (${detalhe}). O link foi descartado.`);
    return { mensagem: MENSAGEM_REDEFINICAO_ENVIADA };
  }

  return { mensagem: MENSAGEM_REDEFINICAO_ENVIADA };
}

export async function redefinirSenha(
  entrada: unknown,
  opcoes: { agora?: Date } = {},
): Promise<{ ok: true }> {
  const dados = lerEsquema(esquemaRedefinirSenha, entrada);
  const agora = opcoes.agora ?? new Date();
  const tokenHash = hashTokenRedefinicao(dados.token);
  const senhaHash = await gerarHashSenha(dados.senha);

  await prisma.$transaction(async (tx) => {
    const linha = await tx.redefinicaoSenha.findUnique({ where: { tokenHash } });
    if (!linha || linha.usadoEm || linha.expiraEm <= agora) {
      throw new ErroAplicacao(MENSAGEM_LINK_INVALIDO, 400, "link_invalido");
    }
    const marcado = await tx.redefinicaoSenha.updateMany({
      where: { id: linha.id, usadoEm: null },
      data: { usadoEm: agora },
    });
    if (marcado.count !== 1) {
      throw new ErroAplicacao(MENSAGEM_LINK_INVALIDO, 400, "link_invalido");
    }
    await tx.redefinicaoSenha.updateMany({
      where: { usuarioId: linha.usuarioId, usadoEm: null },
      data: { usadoEm: agora },
    });
    await tx.usuario.update({
      where: { id: linha.usuarioId },
      data: { senhaHash, versaoSessao: { increment: 1 } },
    });
  });

  return { ok: true };
}

async function garantirLimite(ip: string | null, email: string) {
  const desde = new Date(Date.now() - JANELA_MS);
  await prisma.limiteCadastro.deleteMany({
    where: { criadoEm: { lt: new Date(Date.now() - 24 * JANELA_MS) } },
  });

  const porEmail = await prisma.limiteCadastro.count({
    where: { chave: `redefinir-email:${email}`, criadoEm: { gte: desde } },
  });
  const porIp = ip
    ? await prisma.limiteCadastro.count({
        where: { chave: `redefinir-ip:${ip}`, criadoEm: { gte: desde } },
      })
    : 0;

  if (porEmail >= LIMITE_POR_EMAIL || (ip && porIp >= LIMITE_POR_IP)) {
    throw new ErroAplicacao("Muitas tentativas. Tente de novo mais tarde.", 429, "limite_redefinicao");
  }

  await prisma.limiteCadastro.createMany({
    data: [{ chave: `redefinir-email:${email}` }, ...(ip ? [{ chave: `redefinir-ip:${ip}` }] : [])],
  });
}
