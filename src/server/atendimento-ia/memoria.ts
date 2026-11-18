import { dataIsoValida } from "@/lib/data";
import type { ProvedorAtendimentoIa } from "./provedor";

function semAcento(valor: string): string {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function dataDoTexto(texto: string): string | null {
  const iso = texto.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso?.[1] && dataIsoValida(iso[1])) return iso[1];
  const br = texto.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!br) return null;
  const candidato = `${br[3]}-${br[2]}-${br[1]}`;
  return dataIsoValida(candidato) ? candidato : null;
}

// Fora de produção o atendimento não chama o AI Gateway.
export function criarProvedorAtendimentoMemoria(): ProvedorAtendimentoIa {
  return {
    async gerar(entrada) {
      const texto = semAcento(entrada.textoUsuario);
      if (/\b(desconto|abatimento|parcel\w*|humano|atendente|pessoa)\b/.test(texto)) {
        const motivo = /desconto|abatimento|parcel/.test(texto) ? "DESCONTO" : "PEDIDO";
        const saida = await entrada.ferramentas.transferir(motivo);
        return { texto: saida.texto, tokens: 16, saidas: [saida] };
      }
      if (/promess|prometer|vou pagar/.test(texto)) {
        const data = dataDoTexto(entrada.textoUsuario);
        if (!data) {
          return {
            texto: "Para anotar a promessa, envie a data no formato dd/mm/aaaa.",
            tokens: 16,
            saidas: [],
          };
        }
        const lista = await entrada.ferramentas.listarFaturas();
        if (!lista.faturaId) return { texto: lista.texto, tokens: 16, saidas: [lista] };
        const saida = await entrada.ferramentas.registrarPromessa(lista.faturaId, data);
        return { texto: saida.texto, tokens: 16, saidas: [lista, saida] };
      }
      if (/segunda via|pix|link|boleto|copia e cola|linha digit/.test(texto)) {
        const saida = await entrada.ferramentas.segundaVia(null);
        return { texto: saida.texto, tokens: 16, saidas: [saida] };
      }
      const saida = await entrada.ferramentas.listarFaturas();
      return { texto: saida.texto, tokens: 16, saidas: [saida] };
    },
  };
}
