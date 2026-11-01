import { SeloFatura } from "./selo";

const exemplos = [
  { chave: "aberta", status: "PENDING", excluida: false },
  { chave: "vencida", status: "OVERDUE", excluida: false },
  { chave: "paga", status: "RECEIVED", excluida: false },
  { chave: "estorno", status: "REFUNDED", excluida: false },
  { chave: "cancelada", status: "PENDING", excluida: true },
];

export function LegendaFaturas() {
  return (
    <div className="mb-4 rounded-2xl border border-line bg-card px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Situação da fatura</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {exemplos.map((item) => (
          <li key={item.chave}>
            <SeloFatura status={item.status} excluida={item.excluida} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-muted">
        Régua: sino antes do vencimento, calendário no dia e relógio depois. Cinza ainda não enviado, azul quando o
        lembrete saiu, dourado no atraso. O check verde aparece quando a fatura está paga.
      </p>
    </div>
  );
}
