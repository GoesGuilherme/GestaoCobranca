import { idEmpresaLogo } from "./logo";
import { AMOSTRA_REGUA, PASSOS_SUGERIDOS, textoRegua } from "./regua";
import { rotuloStatusFatura } from "./rotulos";

export type DadosEmailAviso = {
  empresa: string;
  cliente: string;
  servico: string;
  valor: string;
  vencimento: string;
  status: string;
  link: string;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  logoUrl: string | null;
  mensagem: string;
  modoTeste: boolean;
};

export type IdTipoAviso = "emissao" | "antes" | "vencimento" | "atraso";

export const TIPOS_AVISO_EMAIL: { id: IdTipoAviso; rotulo: string }[] = [
  { id: "emissao", rotulo: "Na emissão" },
  { id: "antes", rotulo: "Antes do vencimento" },
  { id: "vencimento", rotulo: "No vencimento" },
  { id: "atraso", rotulo: "Depois do vencimento" },
];

const LINHA_AMOSTRA = "23793.38128 60083.013528 56000.063307 7 89840000010000";
const PIX_AMOSTRA = "00020126360014BR.GOV.BCB.PIX0114exemplo@pix.test5204000053039865406150.00";

const FUNDO = "#f4f7fb";
const CARTAO = "#ffffff";
const TINTA = "#051a3a";
const APOIO = "#5a6b80";
const LINHA = "#d5dee8";
const AZUL = "#0b3861";
const AREIA = "#e6eef6";
const DOURADO = "#c7922e";
const DOURADO_SUAVE = "#f8efda";
const DOURADO_TINTA = "#6b4e0e";
const FONTE = "Outfit,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif";

export function montarEmailAviso(dados: DadosEmailAviso): { texto: string; html: string } {
  const empresa = dados.empresa.trim() || "Empresa";
  const cliente = dados.cliente.trim() || "cliente";
  const valor = dados.valor.trim();
  const vencimento = dados.vencimento.trim();
  const status = dados.status.trim();
  const link = hrefSeguro(dados.link);
  const linha = textoOpcional(dados.linhaDigitavel);
  const pix = textoOpcional(dados.pixCopiaCola);
  const logo = logoPermitida(dados.logoUrl);
  const mensagem = corpoDepoisDaSaudacao(cliente, dados.mensagem);

  return {
    texto: textoPlano({
      modoTeste: dados.modoTeste,
      mensagem: dados.mensagem.trim(),
      valor,
      vencimento,
      status,
      link,
      linha,
      pix,
    }),
    html: htmlDoAviso({
      empresa,
      cliente,
      valor,
      vencimento,
      status,
      link,
      linha,
      pix,
      logo,
      mensagem,
      modoTeste: dados.modoTeste,
    }),
  };
}

export function dadosAmostraAviso(tipo: IdTipoAviso, empresa: string): Omit<DadosEmailAviso, "logoUrl" | "modoTeste"> {
  const indice = tipo === "emissao" ? 0 : tipo === "antes" ? 1 : tipo === "vencimento" ? 2 : 3;
  const passo = PASSOS_SUGERIDOS[indice];
  const atraso = tipo === "atraso";
  const campos = {
    cliente: AMOSTRA_REGUA.cliente,
    servico: AMOSTRA_REGUA.servico,
    valor: AMOSTRA_REGUA.valor,
    vencimento: AMOSTRA_REGUA.vencimento,
    link: AMOSTRA_REGUA.link,
    diasAtraso: atraso ? "3" : "0",
    empresa,
  };
  return {
    empresa,
    cliente: campos.cliente,
    servico: campos.servico,
    valor: campos.valor,
    vencimento: campos.vencimento,
    status: rotuloStatusFatura(atraso ? "OVERDUE" : "PENDING", false),
    link: campos.link,
    linhaDigitavel: tipo === "vencimento" ? null : LINHA_AMOSTRA,
    pixCopiaCola: tipo === "vencimento" || tipo === "atraso" ? PIX_AMOSTRA : null,
    mensagem: textoRegua(passo.corpo, campos),
  };
}

function textoPlano(dados: {
  modoTeste: boolean;
  mensagem: string;
  valor: string;
  vencimento: string;
  status: string;
  link: string | null;
  linha: string | null;
  pix: string | null;
}): string {
  const cabeca = dados.modoTeste
    ? `Modo teste: este e-mail foi enviado para você, não para o cliente.\n\n${dados.mensagem}`
    : dados.mensagem;
  const linhas = [cabeca, "", `Valor: ${dados.valor}`, `Vencimento: ${dados.vencimento}`, `Situação: ${dados.status}`];
  if (dados.link) linhas.push(`Fatura: ${dados.link}`);
  if (dados.linha) linhas.push(`Linha digitável: ${dados.linha}`);
  if (dados.pix) linhas.push(`Pix copia e cola: ${dados.pix}`);
  return linhas.join("\n");
}

function htmlDoAviso(dados: {
  empresa: string;
  cliente: string;
  valor: string;
  vencimento: string;
  status: string;
  link: string | null;
  linha: string | null;
  pix: string | null;
  logo: string | null;
  mensagem: string;
  modoTeste: boolean;
}): string {
  const titulo = escaparTexto(`Cobrança de ${dados.empresa}`);
  const preheader = escaparTexto(`${dados.empresa}: cobrança de ${dados.valor}, vencimento ${dados.vencimento}.`);
  const cabecalho = dados.logo
    ? `<img src="${escaparAtributo(dados.logo)}" alt="${escaparAtributo(dados.empresa)}" width="168" style="display:block;border:0;outline:none;text-decoration:none;width:168px;max-width:168px;height:auto;">
              <p style="margin:14px 0 0;font-size:16px;line-height:1.4;font-weight:600;color:${TINTA};">${escaparTexto(dados.empresa)}</p>`
    : `<p style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:${TINTA};">${escaparTexto(dados.empresa)}</p>`;
  const faixaTeste = dados.modoTeste
    ? `<tr><td bgcolor="${DOURADO_SUAVE}" style="padding:12px 32px;background:${DOURADO_SUAVE};color:${DOURADO_TINTA};font-size:14px;line-height:1.5;">Modo teste: este e-mail foi enviado para você, não para o cliente.</td></tr>`
    : "";
  const paragrafo = dados.mensagem
    ? `<p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:${TINTA};">${quebrarLinhas(dados.mensagem)}</p>`
    : "";
  const botao = dados.link
    ? `<tr><td style="padding:8px 32px 8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${AZUL}" style="border-radius:8px;background:${AZUL};"><a href="${escaparAtributo(dados.link)}" style="display:inline-block;padding:12px 22px;color:${FUNDO};font-size:15px;line-height:1.2;font-weight:600;text-decoration:none;">Baixar fatura</a></td></tr></table></td></tr>`
    : "";
  const codigos = [
    dados.linha ? blocoCodigo("Linha digitável", dados.linha) : "",
    dados.pix ? blocoCodigo("Pix copia e cola", dados.pix) : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:${FUNDO};color:${TINTA};font-family:${FONTE};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FUNDO}" style="background:${FUNDO};border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARTAO}" style="width:100%;max-width:600px;background:${CARTAO};border-collapse:collapse;">
        <tr><td bgcolor="${DOURADO}" height="4" style="height:4px;background:${DOURADO};font-size:0;line-height:0;">&nbsp;</td></tr>
        ${faixaTeste}
        <tr>
          <td style="padding:28px 32px 8px;">
            ${cabecalho}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 8px;">
            <p style="margin:0;font-size:16px;line-height:1.6;color:${TINTA};">Olá, ${escaparTexto(dados.cliente)}.</p>
            ${paragrafo}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${linhaDetalhe("Valor", dados.valor)}
              ${linhaDetalhe("Vencimento", dados.vencimento)}
              ${linhaDetalhe("Situação", dados.status)}
            </table>
          </td>
        </tr>
        ${botao}
        ${codigos}
        <tr>
          <td style="padding:8px 32px 28px;">
            <p style="margin:16px 0 0;padding-top:16px;border-top:1px solid ${LINHA};font-size:12px;line-height:1.5;color:${APOIO};">Aviso de cobrança enviado por ${escaparTexto(dados.empresa)}. Se você já pagou, desconsidere esta mensagem.</p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

function linhaDetalhe(rotulo: string, valor: string): string {
  return `<tr>
    <td width="140" valign="top" style="padding:8px 12px 8px 0;width:140px;font-size:14px;line-height:1.4;color:${APOIO};">${escaparTexto(rotulo)}</td>
    <td valign="top" style="padding:8px 0;font-size:14px;line-height:1.4;font-weight:600;color:${TINTA};">${escaparTexto(valor)}</td>
  </tr>`;
}

function blocoCodigo(titulo: string, valor: string): string {
  return `<tr><td style="padding:4px 32px 8px;">
    <p style="margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${APOIO};">${escaparTexto(titulo)}</p>
    <p style="margin:0;padding:12px 14px;background:${AREIA};border-radius:8px;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.5;color:${TINTA};word-break:normal;overflow-wrap:anywhere;">${escaparTexto(valor)}</p>
  </td></tr>`;
}

function quebrarLinhas(valor: string): string {
  return valor
    .split(/\r?\n/)
    .map((linha) => escaparTexto(linha))
    .join("<br>");
}

function textoOpcional(valor: string | null | undefined): string | null {
  const limpo = valor?.trim() ?? "";
  return limpo ? limpo : null;
}

function corpoDepoisDaSaudacao(cliente: string, mensagem: string): string {
  const texto = mensagem.trim();
  if (!texto) return "";
  const nome = cliente.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const comNome = new RegExp(`^ol[aá]\\s*,\\s*${nome}\\s*[.!]\\s*`, "i");
  if (nome && comNome.test(texto)) return texto.replace(comNome, "").trim();
  const simples = /^ol[aá]\s*,\s*/i;
  if (simples.test(texto)) return texto.replace(simples, "").trim();
  return texto;
}

function hrefSeguro(valor: string): string | null {
  const limpo = valor.trim();
  if (!limpo) return null;
  try {
    const url = new URL(limpo);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function logoPermitida(valor: string | null | undefined): string | null {
  const limpa = valor?.trim() ?? "";
  if (!limpa) return null;
  if (limpa.startsWith("/api/publico/logos/")) {
    const [caminho, consulta] = limpa.split("?");
    const id = caminho.slice("/api/publico/logos/".length);
    if (idEmpresaLogo(id) && consulta && /^v=[A-Za-z0-9._~%-]+$/.test(consulta) && !limpa.includes("..")) return limpa;
    return null;
  }
  if (/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(limpa) && limpa.length <= 750_000) return limpa;
  return hrefSeguro(limpa);
}

function escaparTexto(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escaparAtributo(valor: string): string {
  return escaparTexto(valor).replaceAll("\r", " ").replaceAll("\n", " ");
}
