export function AvisoModoTeste({ ativo }: { ativo: boolean }) {
  if (!ativo) return null;
  return (
    <p className="mb-6 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-ink" data-testid="aviso-modo-teste">
      Modo teste ligado. Os e-mails da régua não vão para o cliente: o envio diário vai para o dono da empresa e Enviar lembrete vai para quem está logado. Só o dono desliga o modo teste.
    </p>
  );
}
