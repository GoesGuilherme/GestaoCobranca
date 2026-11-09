import { motivoForaDoReenvio, passoEmissaoAplicavel, type ReguaEmissao } from "@/lib/reenvio-boleto";
import type { ResultadoReenvioBoletos } from "@/lib/tipos";
import { esquemaReenvioBoletos } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { textoErroEnvio } from "@/server/regua/envio";
import type { ClienteResend } from "@/server/regua/resend";
import { lerEsquema } from "@/server/validar";
import { enviarLembreteAgora } from "./regua-service";

type AutorReenvio = AutorEmpresa & { email: string; nomeEmpresa: string };

function motivoDe(erro: unknown): { resultado: "ignorado" | "falha"; motivo: string } {
  if (erro instanceof ErroAplicacao) {
    if (erro.status === 401 || erro.status === 403) throw erro;
    const motivo = textoErroEnvio(erro);
    if (erro.status >= 500) return { resultado: "falha", motivo };
    return { resultado: "ignorado", motivo };
  }
  console.error(textoErroEnvio(erro));
  return { resultado: "falha", motivo: "Falha ao enviar." };
}

export async function reenviarBoletos(
  autor: AutorReenvio,
  entrada: unknown,
  opcoes: { resend?: ClienteResend; agora?: Date } = {},
): Promise<ResultadoReenvioBoletos> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaReenvioBoletos, entrada);
  const ids = [...new Set(dados.ids)];
  const config = await prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } });
  if (!config?.chaveResendCifrada) {
    throw new ErroAplicacao("Configure o remetente e a chave da Resend antes de enviar.", 400, "regua_incompleta");
  }

  const [faturas, reguasBrutas] = await Promise.all([
    prisma.fatura.findMany({
      where: { empresaId: autor.empresaId, id: { in: ids } },
      select: {
        id: true,
        status: true,
        excluida: true,
        formaCobranca: true,
        boletoUrl: true,
        provedor: true,
        cliente: { select: { email: true, reguaModo: true, reguaId: true } },
      },
    }),
    prisma.reguaCobranca.findMany({
      where: { empresaId: autor.empresaId },
      select: {
        id: true,
        padrao: true,
        passos: { select: { id: true, naEmissao: true, ordem: true }, orderBy: { ordem: "asc" } },
      },
    }),
  ]);
  const reguas: ReguaEmissao[] = reguasBrutas;
  const porId = new Map(faturas.map((fatura) => [fatura.id, fatura]));
  const resultado: ResultadoReenvioBoletos = {
    aceitos: 0,
    ignorados: 0,
    falhas: 0,
    modoTeste: config.modoTeste,
    itens: [],
  };

  for (const id of ids) {
    const fatura = porId.get(id);
    if (!fatura) {
      resultado.ignorados += 1;
      resultado.itens.push({ id, resultado: "ignorado", motivo: "Fatura não encontrada." });
      continue;
    }
    const motivo = motivoForaDoReenvio(
      {
        formaCobranca: fatura.formaCobranca,
        boletoUrl: fatura.boletoUrl,
        excluida: fatura.excluida,
        status: fatura.status,
        provedor: fatura.provedor,
        email: fatura.cliente.email,
        reguaModo: fatura.cliente.reguaModo,
        reguaId: fatura.cliente.reguaId,
      },
      { modoTeste: config.modoTeste, reguas },
    );
    if (motivo) {
      resultado.ignorados += 1;
      resultado.itens.push({ id, resultado: "ignorado", motivo });
      continue;
    }
    const passo = passoEmissaoAplicavel(
      { reguaModo: fatura.cliente.reguaModo, reguaId: fatura.cliente.reguaId },
      reguas,
    );
    if (!passo) {
      resultado.ignorados += 1;
      resultado.itens.push({ id, resultado: "ignorado", motivo: "Sem passo de emissão na régua." });
      continue;
    }
    try {
      const lembrete = await enviarLembreteAgora(autor, fatura.id, { passoId: passo.id }, opcoes);
      if (lembrete.status === "ENVIADO") {
        resultado.aceitos += 1;
        resultado.itens.push({ id, resultado: "aceito", motivo: null });
      } else if (lembrete.status === "FALHOU") {
        resultado.falhas += 1;
        resultado.itens.push({ id, resultado: "falha", motivo: lembrete.motivo ?? "Falha ao enviar." });
      } else {
        resultado.ignorados += 1;
        resultado.itens.push({ id, resultado: "ignorado", motivo: lembrete.motivo ?? "Ignorado." });
      }
    } catch (erro) {
      const item = motivoDe(erro);
      if (item.resultado === "falha") resultado.falhas += 1;
      else resultado.ignorados += 1;
      resultado.itens.push({ id, resultado: item.resultado, motivo: item.motivo });
    }
  }

  return resultado;
}
