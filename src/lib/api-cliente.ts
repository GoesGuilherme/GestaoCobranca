export type RespostaFalha = {
  ok: false;
  status: number;
  erro: string;
  campos?: Record<string, string>;
};

export async function enviarJson<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  corpo?: unknown,
): Promise<{ ok: true; dados: T } | RespostaFalha> {
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    return { ok: false, status: 0, erro: "Não foi possível falar com o servidor." };
  }

  const dados = (await resposta.json().catch(() => ({}))) as {
    erro?: string;
    campos?: Record<string, string>;
  } & T;

  if (!resposta.ok) {
    return {
      ok: false,
      status: resposta.status,
      erro: dados.erro ?? "Não foi possível concluir a operação.",
      campos: dados.campos,
    };
  }

  return { ok: true, dados };
}
