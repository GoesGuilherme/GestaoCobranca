export default function Carregando() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">Carregando a página.</p>
      <div className="mb-8 space-y-3">
        <div className="h-3 w-28 animate-pulse rounded-full bg-sand" />
        <div className="h-10 w-64 max-w-full animate-pulse rounded-2xl bg-sand" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-full bg-sand" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["a", "b", "c", "d"].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-3xl bg-sand" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-3xl bg-sand" />
    </div>
  );
}
