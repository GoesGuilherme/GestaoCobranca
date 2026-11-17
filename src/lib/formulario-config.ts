export function remetenteAlterado(
  atual: { nome: string; email: string; reply: string; chave: string },
  salvo: { nome: string; email: string; reply: string },
) {
  return (
    atual.nome !== salvo.nome ||
    atual.email !== salvo.email ||
    atual.reply !== salvo.reply ||
    atual.chave.trim() !== ""
  );
}

export function ligacaoReguaAlterada(
  atual: { ativa: boolean; modoTeste: boolean },
  salvo: { ativa: boolean; modoTeste: boolean },
) {
  return atual.ativa !== salvo.ativa || atual.modoTeste !== salvo.modoTeste;
}
