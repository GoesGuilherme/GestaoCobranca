import { dataHojeIso, isoDeData } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarData, formatarDataIso } from "@/lib/formatacao";
import { mascaraConta, referenciaOfx, rotuloBanco } from "@/lib/ofx/chave";
import { conciliarExtrato, decidirCredito, whereFaturasPixAbertas, type FaturaParaConciliar } from "@/lib/ofx/conciliar";
import { ErroOfx, analisarOfx, type CreditoOfx } from "@/lib/ofx/parser";
import type { CreditoNaoIdentificado, PainelOfx, ResumoOfx, SugestaoOfx } from "@/lib/ofx/tipos";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca, exigirVerFaturas } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { liquidarFaturaPix } from "./pix-cobranca";

const LIMITE_CREDITOS = 2000;

type Autor = AutorEmpresa & { usuarioId?: string };

function codigoPrisma(erro: unknown): string | null {
  if (typeof erro === "object" && erro !== null && "code" in erro && typeof (erro as { code: unknown }).code === "string") {
    return (erro as { code: string }).code;
  }
  return null;
}

function nomeArquivo(nome: string): string {
  const base = (nome.split(/[/\\]/).pop() ?? "extrato.ofx").replace(/[^\w.\- ()]+/g, "").slice(0, 160);
  if (!base) return "extrato.ofx";
  return base.toLowerCase().endsWith(".ofx") ? base : `${base}.ofx`;
}

function notaOfx(arquivo: string, credito: { bankId: string; acctId: string; fitId: string }): string {
  return `OFX ${arquivo}. Banco ${credito.bankId}. Conta ${credito.acctId}. FITID ${credito.fitId}.`.slice(0, 500);
}

function chaveCredito(credito: { bankId: string; acctId: string; fitId: string }): string {
  return `${credito.bankId}|${credito.acctId}|${credito.fitId}`;
}

function idsCandidatos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 64);
}

function textoCurto(valor: string | null | undefined, limite: number): string {
  return (valor ?? "").replace(/\s+/g, " ").trim().slice(0, limite);
}

async function faturasAbertas(empresaId: string): Promise<FaturaParaConciliar[]> {
  const linhas = await prisma.fatura.findMany({
    where: whereFaturasPixAbertas(empresaId),
    select: {
      id: true,
      valor: true,
      idExterno: true,
      criadoEm: true,
      cliente: { select: { nomeFantasia: true, razaoSocial: true, documento: true } },
    },
  });
  return linhas.map((linha) => ({
    id: linha.id,
    valor: linha.valor.toFixed(2),
    txid: linha.idExterno,
    emissao: dataHojeIso(linha.criadoEm),
    nomeFantasia: linha.cliente.nomeFantasia,
    razaoSocial: linha.cliente.razaoSocial,
    documento: linha.cliente.documento,
  }));
}

function dadosTransacao(
  autor: Autor,
  importacaoId: string,
  credito: CreditoOfx,
  situacao: "BAIXADA" | "SUGESTAO" | "NAO_IDENTIFICADA" | "IGNORADA",
  faturaId: string | null,
  candidatas: string[],
) {
  return {
    empresaId: autor.empresaId,
    importacaoId,
    bankId: credito.bankId,
    acctId: credito.acctId,
    fitId: credito.fitId,
    valor: credito.valor,
    dataCredito: new Date(`${credito.data}T00:00:00.000Z`),
    memo: credito.memo || null,
    nome: credito.nome || null,
    situacao,
    faturaId,
    candidatas,
  };
}

async function gravarSemBaixa(
  autor: Autor,
  importacaoId: string,
  credito: CreditoOfx,
  situacao: "SUGESTAO" | "NAO_IDENTIFICADA",
  candidatas: string[],
) {
  try {
    await prisma.transacaoOfx.create({
      data: dadosTransacao(autor, importacaoId, credito, situacao, null, candidatas),
    });
    return true;
  } catch (erro) {
    if (codigoPrisma(erro) === "P2002") return false;
    throw erro;
  }
}

function resumoDe(linha: {
  id: string;
  nomeArquivo: string;
  bankId: string;
  acctId: string;
  baixadas: number;
  sugestoes: number;
  naoIdentificadas: number;
  jaImportadas: number;
  criadoEm: Date;
}): ResumoOfx {
  return {
    id: linha.id,
    nomeArquivo: linha.nomeArquivo,
    banco: rotuloBanco(linha.bankId),
    contaMascarada: mascaraConta(linha.acctId),
    baixadas: linha.baixadas,
    sugestoes: linha.sugestoes,
    naoIdentificadas: linha.naoIdentificadas,
    jaImportadas: linha.jaImportadas,
    criadoEm: formatarData(linha.criadoEm.toISOString()),
  };
}

export async function obterPainelOfx(autor: AutorEmpresa): Promise<PainelOfx> {
  exigirVerFaturas(autor);
  const historicoLinhas = await prisma.importacaoOfx.findMany({
    where: { empresaId: autor.empresaId },
    orderBy: { criadoEm: "desc" },
    take: 20,
  });
  const ultima = historicoLinhas[0] ?? null;
  const sugestoesLinhas = await prisma.transacaoOfx.findMany({
    where: { empresaId: autor.empresaId, situacao: "SUGESTAO" },
    orderBy: { dataCredito: "desc" },
    take: 100,
  });
  const ids = [...new Set(sugestoesLinhas.flatMap((linha) => idsCandidatos(linha.candidatas)))];
  const faturas = ids.length
    ? await prisma.fatura.findMany({
        where: { empresaId: autor.empresaId, id: { in: ids } },
        select: {
          id: true,
          valor: true,
          vencimento: true,
          status: true,
          cliente: { select: { nomeFantasia: true } },
        },
      })
    : [];
  const porId = new Map(faturas.map((fatura) => [fatura.id, fatura]));
  const sugestoes: SugestaoOfx[] = sugestoesLinhas.map((linha) => ({
    id: linha.id,
    data: formatarDataIso(isoDeData(linha.dataCredito)),
    valor: formatarReais(linha.valor.toFixed(2)),
    nome: textoCurto(linha.nome, 80),
    descricao: textoCurto(linha.memo, 160),
    candidatas: idsCandidatos(linha.candidatas).flatMap((id) => {
      const fatura = porId.get(id);
      if (!fatura) return [];
      return [
        {
          id: fatura.id,
          cliente: fatura.cliente.nomeFantasia,
          valor: formatarReais(fatura.valor.toFixed(2)),
          vencimento: formatarDataIso(isoDeData(fatura.vencimento)),
          status: fatura.status,
        },
      ];
    }),
  }));
  const naoLinhas = ultima
    ? await prisma.transacaoOfx.findMany({
        where: { empresaId: autor.empresaId, importacaoId: ultima.id, situacao: "NAO_IDENTIFICADA" },
        orderBy: { dataCredito: "desc" },
        take: 50,
      })
    : [];
  const naoIdentificadas: CreditoNaoIdentificado[] = naoLinhas.map((linha) => ({
    id: linha.id,
    data: formatarDataIso(isoDeData(linha.dataCredito)),
    valor: formatarReais(linha.valor.toFixed(2)),
    nome: textoCurto(linha.nome, 80),
    descricao: textoCurto(linha.memo, 160),
  }));
  return {
    ultima: ultima ? resumoDe(ultima) : null,
    historico: historicoLinhas.map(resumoDe),
    sugestoes,
    naoIdentificadas,
  };
}

export async function importarExtratoOfx(
  autor: Autor,
  arquivo: { nome: string; conteudo: Uint8Array },
  agora = new Date(),
): Promise<ResumoOfx> {
  exigirCobranca(autor);
  if (!arquivo.nome.toLowerCase().endsWith(".ofx")) {
    throw new ErroAplicacao("Envie um arquivo .ofx.", 400, "extensao");
  }
  let extrato;
  try {
    extrato = analisarOfx(arquivo.conteudo);
  } catch (erro) {
    if (erro instanceof ErroOfx) throw new ErroAplicacao(erro.message, 422, "ofx_invalido");
    throw erro;
  }
  if (extrato.creditos.length > LIMITE_CREDITOS) {
    throw new ErroAplicacao("O extrato tem créditos demais para uma importação.", 422, "ofx_grande");
  }

  const arquivoNome = nomeArquivo(arquivo.nome);
  const hoje = dataHojeIso(agora);
  const jaVistas = new Set<string>();
  if (extrato.creditos.length > 0) {
    const existentes = await prisma.transacaoOfx.findMany({
      where: {
        empresaId: autor.empresaId,
        OR: extrato.creditos.map((credito) => ({
          bankId: credito.bankId,
          acctId: credito.acctId,
          fitId: credito.fitId,
        })),
      },
      select: { bankId: true, acctId: true, fitId: true },
    });
    for (const linha of existentes) jaVistas.add(chaveCredito(linha));
  }

  const novos = extrato.creditos.filter((credito) => !jaVistas.has(chaveCredito(credito)));
  const jaImportadasIniciais = extrato.creditos.length - novos.length;
  const abertas = await faturasAbertas(autor.empresaId);
  const decisoes = conciliarExtrato(novos, abertas);

  const importacao = await prisma.importacaoOfx.create({
    data: {
      empresaId: autor.empresaId,
      usuarioId: autor.usuarioId ?? null,
      nomeArquivo: arquivoNome,
      bankId: extrato.bankId,
      acctId: extrato.acctId,
      moeda: extrato.moeda,
      jaImportadas: jaImportadasIniciais,
    },
  });

  let baixadas = 0;
  let sugestoes = 0;
  let naoIdentificadas = 0;
  let jaImportadas = jaImportadasIniciais;

  try {
    for (let indice = 0; indice < novos.length; indice += 1) {
      const credito = novos[indice];
      let decisao = decisoes[indice];
      if (decisao.tipo === "automatico" && credito.data > hoje) {
        decisao = { tipo: "nao_identificado" };
      }
      if (decisao.tipo === "automatico") {
        const resultado = await tentarBaixa(autor, importacao.id, arquivoNome, credito, decisao.faturaId, agora);
        if (resultado === "baixada") {
          baixadas += 1;
          continue;
        }
        if (resultado === "duplicada") {
          jaImportadas += 1;
          continue;
        }
        const deNovo = decidirCredito(credito, await faturasAbertas(autor.empresaId));
        decisao = deNovo.tipo === "automatico" ? { tipo: "sugestao", faturaIds: [deNovo.faturaId] } : deNovo;
      }
      if (decisao.tipo === "sugestao") {
        const gravou = await gravarSemBaixa(autor, importacao.id, credito, "SUGESTAO", decisao.faturaIds);
        if (gravou) sugestoes += 1;
        else jaImportadas += 1;
        continue;
      }
      const gravou = await gravarSemBaixa(autor, importacao.id, credito, "NAO_IDENTIFICADA", []);
      if (gravou) naoIdentificadas += 1;
      else jaImportadas += 1;
    }
  } finally {
    await prisma.importacaoOfx.updateMany({
      where: { id: importacao.id, empresaId: autor.empresaId },
      data: { baixadas, sugestoes, naoIdentificadas, jaImportadas },
    });
  }

  const salva = await prisma.importacaoOfx.findFirstOrThrow({
    where: { id: importacao.id, empresaId: autor.empresaId },
  });
  return resumoDe(salva);
}

async function tentarBaixa(
  autor: Autor,
  importacaoId: string,
  arquivo: string,
  credito: CreditoOfx,
  faturaId: string,
  agora: Date,
): Promise<"baixada" | "recusada" | "duplicada"> {
  try {
    const ok = await liquidarFaturaPix(
      autor,
      faturaId,
      {
        pagoEm: credito.data,
        nota: notaOfx(arquivo, credito),
        origem: "OFX",
        referenciaExterna: referenciaOfx(credito),
      },
      agora,
      async (tx) => {
        await tx.transacaoOfx.create({
          data: dadosTransacao(autor, importacaoId, credito, "BAIXADA", faturaId, []),
        });
      },
    );
    return ok ? "baixada" : "recusada";
  } catch (erro) {
    if (codigoPrisma(erro) !== "P2002") throw erro;
    try {
      await prisma.transacaoOfx.create({
        data: dadosTransacao(autor, importacaoId, credito, "BAIXADA", null, []),
      });
    } catch (deNovo) {
      if (codigoPrisma(deNovo) !== "P2002") throw deNovo;
    }
    return "duplicada";
  }
}

export async function confirmarSugestaoOfx(autor: Autor, transacaoId: string, faturaId: string, agora = new Date()) {
  exigirCobranca(autor);
  const transacao = await prisma.transacaoOfx.findFirst({
    where: { id: transacaoId, empresaId: autor.empresaId, situacao: "SUGESTAO" },
    include: { importacao: { select: { nomeArquivo: true } } },
  });
  if (!transacao) throw new ErroAplicacao("Sugestão não encontrada.", 404, "nao_encontrado");
  if (!idsCandidatos(transacao.candidatas).includes(faturaId)) {
    throw new ErroAplicacao("Escolha uma das cobranças sugeridas.", 422, "fatura_fora_da_sugestao");
  }
  const credito = {
    bankId: transacao.bankId,
    acctId: transacao.acctId,
    fitId: transacao.fitId,
  };
  let ok = false;
  try {
    ok = await liquidarFaturaPix(
      autor,
      faturaId,
      {
        pagoEm: isoDeData(transacao.dataCredito),
        nota: notaOfx(transacao.importacao.nomeArquivo, credito),
        origem: "OFX",
        referenciaExterna: referenciaOfx(credito),
      },
      agora,
      async (tx) => {
        const marcado = await tx.transacaoOfx.updateMany({
          where: { id: transacao.id, empresaId: autor.empresaId, situacao: "SUGESTAO" },
          data: { situacao: "BAIXADA", faturaId, candidatas: [] },
        });
        if (marcado.count !== 1) {
          throw new ErroAplicacao("Essa sugestão já foi resolvida.", 409, "sugestao_resolvida");
        }
      },
    );
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    if (codigoPrisma(erro) === "P2002") {
      throw new ErroAplicacao("Esse crédito do extrato já baixou uma cobrança.", 409, "ofx_duplicado");
    }
    throw erro;
  }
  if (!ok) throw new ErroAplicacao("Essa cobrança não está mais em aberto.", 409, "fatura_fechada");
}

export async function ignorarSugestaoOfx(autor: Autor, transacaoId: string) {
  exigirCobranca(autor);
  const marcado = await prisma.transacaoOfx.updateMany({
    where: { id: transacaoId, empresaId: autor.empresaId, situacao: "SUGESTAO" },
    data: { situacao: "IGNORADA", candidatas: [] },
  });
  if (marcado.count !== 1) throw new ErroAplicacao("Sugestão não encontrada.", 404, "nao_encontrado");
}
