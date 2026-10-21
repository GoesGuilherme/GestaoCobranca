import { z } from "zod";
import { mensagensDoZod } from "@/lib/validacao";
import { ErroAplicacao } from "./erros";

export function lerEsquema<T>(esquema: z.ZodType<T>, entrada: unknown): T {
  const resultado = esquema.safeParse(entrada);
  if (resultado.success) return resultado.data;

  const campos = mensagensDoZod(resultado.error);
  const primeira = Object.values(campos)[0] ?? "Revise os campos destacados.";
  throw new ErroAplicacao(primeira, 400, "validacao", campos);
}
