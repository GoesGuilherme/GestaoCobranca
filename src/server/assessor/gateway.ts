import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import type { ResultadoFerramenta } from "./ferramentas";
import type { ProvedorAssessor } from "./provedor";
import { juntarTextos, redigirComFerramentas, textoConfiavel } from "./redigir";

type AmbienteGateway = NodeJS.ProcessEnv;

function modeloDe(env: AmbienteGateway) {
  const modelo = env.AI_GATEWAY_MODEL?.trim() ?? "";
  if (!modelo.includes("/")) {
    throw new Error("ai_gateway_sem_modelo");
  }
  return modelo;
}

function tokensDe(uso: { totalTokens?: number; inputTokens?: number; outputTokens?: number }) {
  if (typeof uso.totalTokens === "number") return uso.totalTokens;
  return (uso.inputTokens ?? 0) + (uso.outputTokens ?? 0);
}

// A chave não entra no código. O AI SDK lê AI_GATEWAY_API_KEY ou o OIDC da Vercel.
export function criarProvedorAssessorGateway(env: AmbienteGateway = process.env): ProvedorAssessor {
  return {
    async gerar(entrada) {
      const modelo = modeloDe(env);
      const resultado = await generateText({
        model: modelo,
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
          listar_faturas_abertas: tool({
            description: "Lista as faturas em aberto e vencidas do cliente desta conversa. Não cria cobrança.",
            inputSchema: z.object({}),
            execute: async () => entrada.ferramentas.listarFaturas(),
          }),
          enviar_link_boleto: tool({
            description: "Devolve o link do Asaas já gravado (boleto ou segunda via). Não cria cobrança nova.",
            inputSchema: z.object({
              faturaId: z.string().min(1).max(64).optional().describe("Id devolvido pela lista. Omita para a cobrança em aberto mais antiga."),
            }),
            execute: async ({ faturaId }) => entrada.ferramentas.linkBoleto(faturaId ?? null),
          }),
          consultar_pagamento: tool({
            description: "Informa se uma fatura deste cliente está paga. Não altera a cobrança.",
            inputSchema: z.object({
              faturaId: z.string().min(1).max(64).optional().describe("Id da fatura. Omita para a cobrança mais recente."),
            }),
            execute: async ({ faturaId }) => entrada.ferramentas.consultarPagamento(faturaId ?? null),
          }),
          pedir_atendimento_humano: tool({
            description: "Registra pedido para uma pessoa da empresa quando o assunto é técnico ou o cliente pede um humano.",
            inputSchema: z.object({
              motivo: z.enum(["TECNICO", "PEDIDO", "FORA_ESCOPO"]),
              resumo: z.string().min(1).max(500),
            }),
            execute: async ({ motivo, resumo }) => entrada.ferramentas.pedirHumano(motivo, resumo),
          }),
        },
      });
      const saidas = resultado.toolResults.map((item) => item.output as ResultadoFerramenta);
      const textoModelo = resultado.text.trim();
      let texto = textoModelo;
      if (saidas.length > 0 && !textoConfiavel(textoModelo, saidas)) {
        texto = juntarTextos(saidas);
      } else if (saidas.length === 0) {
        texto = (await redigirComFerramentas(entrada.textoUsuario, entrada.ferramentas)).texto;
      }
      return { texto: texto.slice(0, 1500), tokens: tokensDe(resultado.totalUsage ?? resultado.usage) };
    },
  };
}
