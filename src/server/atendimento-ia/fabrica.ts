import type { ProvedorAtendimentoIa } from "./provedor";
import { criarProvedorAtendimentoGateway } from "./gateway";
import { criarProvedorAtendimentoMemoria } from "./memoria";

// Fora de produção o mock usa as ferramentas, sem rede e sem chave.
export function provedorAtendimentoPadrao(env: NodeJS.ProcessEnv = process.env): ProvedorAtendimentoIa {
  if (env.NODE_ENV !== "production") return criarProvedorAtendimentoMemoria();
  return criarProvedorAtendimentoGateway(env);
}
