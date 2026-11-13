import { motivoForaDoReenvio, passoEmissaoAplicavel, type PassoEmissao, type ReguaEmissao } from "@/lib/reenvio-boleto";
import type { ContagemCanalReenvio, ResultadoCanalReenvio, ResultadoReenvioBoletos } from "@/lib/tipos";
import { esquemaReenvioBoletos } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { textoErroEnvio } from "@/server/regua/envio";
import type { ClienteResend } from "@/server/regua/resend";
import type { ClienteTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao } from "@/server/twilio/fabrica";
import { lerEsquema } from "@/server/validar";
import { enviarLembreteAgora } from "./regua-service";
import {
  canalWhatsappGravado,
  concluirWhatsappDoPasso,
  prepararWhatsappDoPasso,
  type FaturaWhatsappPasso,
  type PassoWhatsapp,
} from "./whatsapp-passo";

type AutorReenvio = AutorEmpresa & { email: string; nomeEmpresa: string };

type FaturaReenvio = FaturaWhatsappPasso & {
  status: string;
  provedor: string;
  cliente: FaturaWhatsappPasso["cliente"] & { email: string; reguaId: string | null };
};

function canalEmail(resultado: ResultadoCanalReenvio["resultado"], motivo: string | null): ResultadoCanalReenvio {
  return { canal: "EMAIL", resultado, motivo };
}

function motivoDe(erro: unknown): ResultadoCanalReenvio {
  if (erro instanceof ErroAplicacao) {
    if (erro.status === 401 || erro.status === 403) throw erro;
    const motivo = textoErroEnvio(erro);
    if (erro.status >= 500) return canalEmail("falha", motivo);
    return canalEmail("ignorado", motivo);
  }
  console.error(textoErroEnvio(erro));
  return canalEmail("falha", "Falha ao enviar.");
}

function contagem(itens: ResultadoReenvioBoletos["itens"], canal: "EMAIL" | "WHATSAPP"): ContagemCanalReenvio {
  const lista = itens.flatMap((item) => item.canais.filter((parte) => parte.canal === canal));
  return {
    aceitos: lista.filter((parte) => parte.resultado === "aceito").length,
    ignorados: lista.filter((parte) => parte.resultado === "ignorado").length,
    falhas: lista.filter((parte) => parte.resultado === "falha").length,
    naFila: lista.filter((parte) => parte.resultado === "na_fila").length,
  };
}

function ambos(motivo: string): ResultadoCanalReenvio[] {
  return [canalEmail("ignorado", motivo), { canal: "WHATSAPP", resultado: "ignorado", motivo }];
}

function passoWhatsapp(passo: PassoEmissao): PassoWhatsapp {
  return {
    id: passo.id,
    naEmissao: passo.naEmissao,
    dias: passo.dias ?? null,
    enviarWhatsapp: passo.enviarWhatsapp === true,
  };
}

export async function reenviarBoletos(
  autor: AutorReenvio,
  entrada: unknown,
  opcoes: {
    resend?: ClienteResend;
    twilio?: ClienteTwilio;
    agora?: Date;
    sufixoWhatsapp?: string;
    limiteFila?: number;
  } = {},
): Promise<ResultadoReenvioBoletos> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaReenvioBoletos, entrada);
  const ids = [...new Set(dados.ids)];
  const agora = opcoes.agora ?? new Date();
  const config = await prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } });
  const modoTeste = Boolean(config?.modoTeste);

  const [faturas, reguasBrutas] = await Promise.all([
    prisma.fatura.findMany({
      where: { empresaId: autor.empresaId, id: { in: ids } },
      select: {
        id: true,
        empresaId: true,
        status: true,
        excluida: true,
        formaCobranca: true,
        boletoUrl: true,
        faturaUrl: true,
        provedor: true,
        valor: true,
        vencimento: true,
        criadoEm: true,
        cliente: {
          select: {
            id: true,
            nomeFantasia: true,
            email: true,
            whatsapp: true,
            status: true,
            reguaModo: true,
            reguaId: true,
            reguaPausada: true,
          },
        },
      },
    }),
    prisma.reguaCobranca.findMany({
      where: { empresaId: autor.empresaId },
      select: {
        id: true,
        padrao: true,
        passos: {
          select: { id: true, naEmissao: true, ordem: true, dias: true, enviarWhatsapp: true },
          orderBy: { ordem: "asc" },
        },
      },
    }),
  ]);
  const reguas: ReguaEmissao[] = reguasBrutas;
  const porId = new Map(faturas.map((fatura) => [fatura.id, fatura as FaturaReenvio]));
  const itens: ResultadoReenvioBoletos["itens"] = [];
  const pendentes: { fatura: FaturaReenvio; passo: PassoWhatsapp }[] = [];

  for (const id of ids) {
    const fatura = porId.get(id);
    if (!fatura) {
      itens.push({ id, canais: ambos("Fatura não encontrada.") });
      continue;
    }
    const fora = motivoForaDoReenvio(
      {
        formaCobranca: fatura.formaCobranca,
        boletoUrl: fatura.boletoUrl,
        excluida: fatura.excluida,
        status: fatura.status,
        provedor: fatura.provedor,
        reguaModo: fatura.cliente.reguaModo,
        reguaId: fatura.cliente.reguaId,
      },
      { modoTeste, reguas },
    );
    if (fora) {
      itens.push({ id, canais: ambos(fora) });
      continue;
    }
    const encontrado = passoEmissaoAplicavel(
      { reguaModo: fatura.cliente.reguaModo, reguaId: fatura.cliente.reguaId },
      reguas,
    );
    if (!encontrado) {
      itens.push({ id, canais: ambos("Sem passo de emissão na régua.") });
      continue;
    }
    const passo = passoWhatsapp(encontrado);
    let email: ResultadoCanalReenvio;
    try {
      const envio = await enviarLembreteAgora(autor, fatura.id, { passoId: passo.id }, { ...opcoes, whatsapp: false, agora });
      email = envio.lembrete.status === "ENVIADO"
        ? canalEmail("aceito", null)
        : envio.lembrete.status === "FALHOU"
          ? canalEmail("falha", envio.lembrete.motivo ?? "Falha ao enviar.")
          : canalEmail("ignorado", envio.lembrete.motivo ?? "Ignorado.");
    } catch (erro) {
      email = motivoDe(erro);
    }
    const preparado = await prepararWhatsappDoPasso(fatura, passo, modoTeste, agora, opcoes.sufixoWhatsapp);
    if (preparado.processar) pendentes.push({ fatura, passo });
    itens.push({ id, canais: [email, preparado.canal ?? { canal: "WHATSAPP", resultado: "na_fila", motivo: null }] });
  }

  if (pendentes.length > 0) {
    await concluirWhatsappDoPasso(
      autor.empresaId,
      pendentes.map((item) => item.fatura.id),
      pendentes.map((item) => item.passo),
      opcoes.twilio ?? clienteTwilioPadrao(),
      agora,
      opcoes.limiteFila,
    );
    for (const item of pendentes) {
      const gravado = await canalWhatsappGravado(item.fatura, item.passo);
      const linha = itens.find((atual) => atual.id === item.fatura.id);
      if (!linha) continue;
      linha.canais = linha.canais.map((parte) => (parte.canal === "WHATSAPP" ? gravado : parte));
    }
  }

  return {
    email: contagem(itens, "EMAIL"),
    whatsapp: contagem(itens, "WHATSAPP"),
    modoTeste,
    itens,
  };
}
