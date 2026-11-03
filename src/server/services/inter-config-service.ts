import { gerarTokenWebhook } from "@/lib/asaas-cripto";
import { decifrarSegredoPagamento } from "@/lib/pagamentos-cripto";
import type { ProvedorCodigo } from "@/lib/status-pagamento";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirBanco } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { certificadoPertoDoVencimento, contaCorrenteInter, validarParCertificado } from "@/server/inter/certificado";
import type { ClienteHttpInter } from "@/server/inter/contrato";
import { logInter, logInterErro } from "@/server/inter/log";
import { urlWebhookInter } from "@/server/inter/url-publica";
import { provedorDaEmpresa } from "@/server/pagamentos/fabrica";
import { lerCredenciaisPagamento, salvarCredenciaisPagamento, type AmbientePagamento } from "@/server/pagamentos/credenciais";
import { lerEsquema } from "@/server/validar";
import { esquemaConfiguracaoInter } from "@/lib/validacao";

export type ConfiguracaoInterDTO = {
  provedorAtual: ProvedorCodigo;
  configurado: boolean;
  ambiente: AmbientePagamento | null;
  clientIdMascarado: string | null;
  contaCorrente: string | null;
  temCertificado: boolean;
  certificadoValidoAte: string | null;
  certificadoPertoDoVencimento: boolean;
  certificadoVencido: boolean;
  urlWebhook: string | null;
  aviso: string | null;
};

function mascarar(valor: string | undefined): string | null {
  if (!valor) return null;
  return `••••${valor.slice(-4)}`;
}

function provedorCodigoAtual(valor: string | null | undefined): ProvedorCodigo {
  return valor === "INTER" ? "INTER" : "ASAAS";
}

async function segredoAtual(empresaId: string): Promise<string | null> {
  const linha = await prisma.configuracaoPagamento.findUnique({
    where: { empresaId_provedor: { empresaId, provedor: "INTER" } },
    select: { segredoWebhookCifrado: true },
  });
  if (!linha?.segredoWebhookCifrado) return null;
  try {
    return decifrarSegredoPagamento(linha.segredoWebhookCifrado);
  } catch {
    return null;
  }
}

export async function obterConfiguracaoInter(autor: AutorEmpresa, origem?: string | null): Promise<ConfiguracaoInterDTO> {
  exigirBanco(autor);
  const [empresa, lido, segredo] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: autor.empresaId }, select: { provedorPagamento: true } }),
    lerCredenciaisPagamento(autor.empresaId, "INTER"),
    segredoAtual(autor.empresaId),
  ]);
  const validade = lido?.certificadoValidoAte ?? null;
  const vencido = Boolean(validade && validade.getTime() < Date.now());
  const perto = Boolean(validade && !vencido && certificadoPertoDoVencimento(validade));
  let aviso: string | null = null;
  if (vencido) aviso = "O certificado do Inter está vencido. Gere outro no Internet Banking antes de emitir.";
  else if (perto && validade) {
    aviso = `O certificado do Inter vence em ${validade.toLocaleDateString("pt-BR")}. Gere outro no Internet Banking.`;
  }
  return {
    provedorAtual: provedorCodigoAtual(empresa?.provedorPagamento),
    configurado: Boolean(lido?.credenciais.clientId && lido.credenciais.certificadoPem),
    ambiente: lido?.ambiente ?? null,
    clientIdMascarado: mascarar(lido?.credenciais.clientId),
    contaCorrente: lido?.credenciais.extra?.conta_corrente ?? null,
    temCertificado: Boolean(lido?.credenciais.certificadoPem && lido.credenciais.chavePrivadaPem),
    certificadoValidoAte: validade ? validade.toISOString() : null,
    certificadoPertoDoVencimento: perto,
    certificadoVencido: vencido,
    urlWebhook: segredo ? urlWebhookInter(segredo, origem) ?? `/api/webhooks/inter/${segredo}` : null,
    aviso,
  };
}

export async function salvarConfiguracaoInter(
  autor: AutorEmpresa,
  entrada: unknown,
  origem?: string | null,
  clienteHttp?: ClienteHttpInter,
): Promise<ConfiguracaoInterDTO> {
  exigirBanco(autor);
  const dados = lerEsquema(esquemaConfiguracaoInter, entrada);
  const atual = await lerCredenciaisPagamento(autor.empresaId, "INTER");
  const clientId = dados.clientId || atual?.credenciais.clientId;
  const clientSecret = dados.clientSecret || atual?.credenciais.clientSecret;
  const certificado = dados.certificadoPem || atual?.credenciais.certificadoPem;
  const chave = dados.chavePrivadaPem || atual?.credenciais.chavePrivadaPem;
  const contaInformada = dados.contaCorrente || atual?.credenciais.extra?.conta_corrente || "";
  if (!clientId || !clientSecret || !certificado || !chave || !contaInformada) {
    throw new ErroAplicacao(
      "Informe client id, client secret, conta corrente, certificado e chave privada.",
      400,
      "credencial_invalida",
    );
  }
  const contaCorrente = contaCorrenteInter(contaInformada);
  const validade = validarParCertificado(certificado, chave);
  const segredo = (await segredoAtual(autor.empresaId)) ?? gerarTokenWebhook();
  await salvarCredenciaisPagamento({
    empresaId: autor.empresaId,
    provedor: "INTER",
    ambiente: dados.ambiente,
    credenciais: {
      clientId,
      clientSecret,
      certificadoPem: certificado,
      chavePrivadaPem: chave,
      extra: { conta_corrente: contaCorrente },
    },
    segredoWebhook: segredo,
    certificadoValidoAte: validade,
  });
  await prisma.empresa.update({ where: { id: autor.empresaId }, data: { provedorPagamento: "INTER" } });

  let avisoRegistro: string | null = null;
  const url = urlWebhookInter(segredo, origem);
  if (!url) {
    avisoRegistro = "Credenciais guardadas. Defina PAGAMENTOS_PUBLIC_URL em HTTPS para registrar o webhook no Inter.";
  } else if (!clienteHttp) {
    try {
      const provedor = await provedorDaEmpresa(autor.empresaId);
      if (provedor.registrarWebhook) await provedor.registrarWebhook(url);
      logInter("webhook registrado", { empresaId: autor.empresaId, ambiente: dados.ambiente });
    } catch (erro) {
      logInterErro("falha ao registrar webhook", {
        empresaId: autor.empresaId,
        codigo: erro instanceof ErroAplicacao ? erro.codigo : "erro",
      });
      avisoRegistro = "Credenciais guardadas, mas o Inter ainda não aceitou o webhook. Use Testar conexão e salve de novo.";
    }
  } else if (clienteHttp.registrarWebhook) {
    await clienteHttp.registrarWebhook(url);
  }

  const dto = await obterConfiguracaoInter(autor, origem);
  if (avisoRegistro) dto.aviso = dto.aviso ? `${dto.aviso} ${avisoRegistro}` : avisoRegistro;
  return dto;
}

export async function testarConexaoInter(autor: AutorEmpresa, clienteHttp?: ClienteHttpInter): Promise<{ conta: string }> {
  exigirBanco(autor);
  const provedor = await provedorDaEmpresa(autor.empresaId, undefined, clienteHttp);
  if (provedor.provedor !== "INTER") {
    throw new ErroAplicacao("A empresa não está usando o Banco Inter.", 422, "provedor_indisponivel");
  }
  const conta = await provedor.testarConexao();
  return { conta: conta.titular };
}

export async function usarAsaas(autor: AutorEmpresa): Promise<void> {
  exigirBanco(autor);
  await prisma.empresa.update({ where: { id: autor.empresaId }, data: { provedorPagamento: "ASAAS" } });
}
