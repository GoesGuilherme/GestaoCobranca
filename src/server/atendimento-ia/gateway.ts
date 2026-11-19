import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { modeloAtendimentoIa, textoSeguroIa } from "@/lib/atendimento-ia";
import type { ResultadoFerramenta } from "./ferramentas";
import type { ProvedorAtendimentoIa } from "./provedor";

function tokensDe(uso: { totalTokens?: number; inputTokens?: number; outputTokens?: number } | undefined) {
  if (!uso) return 0;
  if (typeof uso.totalTokens === "number") return uso.totalTokens;
  return (uso.inputTokens ?? 0) + (uso.outputTokens ?? 0);
}

// A chave não entra no código. O AI SDK lê AI_GATEWAY_API_KEY ou o OIDC da Vercel.
export function criarProvedorAtendimentoGateway(env: NodeJS.ProcessEnv = process.env): ProvedorAtendimentoIa {
  return {
    async gerar(entrada) {
      const resultado = await generateText({
        model: modeloAtendimentoIa(env),
        system: entrada.sistema,
        messages: [
          ...entrada.historico.map((mensagem) => ({
            role: mensagem.papel,
            content: mensagem.texto,
          })),
          { role: "user" as const, content: entrada.textoUsuario },
        ],
        maxOutputTokens: entrada.maxTokens,
        timeout: { totalMs: entrada.timeoutMs, stepMs: entrada.timeoutMs },
        stopWhen: isStepCount(4),
        tools: {
          listar_faturas: tool({
            description: "Lista valor, vencimento e situação das faturas em aberto ou vencidas deste cliente. Não cria cobrança.",
            inputSchema: z.object({}),
            execute: async () => entrada.ferramentas.listarFaturas(),
          }),
          reenviar_segunda_via: tool({
            description:
              "Devolve o link de pagamento, o Pix copia e cola e a linha digitável já gravados de uma fatura deste cliente. Não cria cobrança nova e não cita banco.",
            inputSchema: z.object({
              faturaId: z.string().min(1).max(64).optional().describe("Id devolvido pela lista. Omita para a cobrança em aberto mais antiga."),
            }),
            execute: async ({ faturaId }) => entrada.ferramentas.segundaVia(faturaId ?? null),
          }),
          registrar_promessa: tool({
            description:
              "Registra promessa de pagamento no valor integral da fatura, com origem WhatsApp. A data não pode passar do prazo da empresa. Não oferece desconto.",
            inputSchema: z.object({
              faturaId: z.string().min(1).max(64),
              dataPrometida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data ISO, hoje ou futura, dentro do prazo."),
            }),
            execute: async ({ faturaId, dataPrometida }) => entrada.ferramentas.registrarPromessa(faturaId, dataPrometida),
          }),
          transferir_para_humano: tool({
            description: "Para a IA nesta conversa e marca que uma pessoa da empresa precisa assumir. Use quando o cliente pedir humano, desconto ou assunto fora de cobrança.",
            inputSchema: z.object({
              motivo: z.enum(["PEDIDO", "FORA", "DESCONTO"]),
            }),
            execute: async ({ motivo }) => entrada.ferramentas.transferir(motivo),
          }),
        },
      });
      const saidas = resultado.toolResults.map((item) => item.output as ResultadoFerramenta);
      const texto = textoSeguroIa(
        resultado.text.trim(),
        saidas.map((saida) => saida.texto),
      );
      return {
        texto: texto.slice(0, 1000),
        tokens: tokensDe(resultado.totalUsage ?? resultado.usage),
        saidas,
      };
    },
  };
}
