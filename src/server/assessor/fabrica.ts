import type { ProvedorAssessor } from "./provedor";
import { criarProvedorAssessorGateway } from "./gateway";
import { criarProvedorAssessorMemoria } from "./memoria";

// Fora de produção o mock responde com as ferramentas, sem rede e sem chave.
export function provedorAssessorPadrao(env: NodeJS.ProcessEnv = process.env): ProvedorAssessor {
  if (env.NODE_ENV !== "production") return criarProvedorAssessorMemoria();
  return criarProvedorAssessorGateway(env);
}
