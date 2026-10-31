import { LogoTaguaro } from "./logo-taguaro";

export function MolduraAcesso({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-forest-deep px-12 py-12 text-paper lg:flex">
        <div>
          <LogoTaguaro tom="escuro" />
          <h2 className="mt-10 max-w-md font-display text-5xl leading-[1.05]">
            Clientes e unidades, num lugar só.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-white/90">
            Cada empresa assinante cuida dos próprios clientes. Dentro de um cliente ficam as
            unidades: o food truck da praia, o mercado da esquina, a loja do shopping.
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">Exemplo de grupo</p>
          <p className="mt-2 font-medium">Grupo Costa Verde Exemplo</p>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            <li>PRAIA GRANDE FOODTRUCK</li>
            <li>SANTOS CENTRO EXEMPLO</li>
            <li>GUARUJÁ SHOPPING EXEMPLO</li>
          </ul>
        </div>
      </section>
      <section id="conteudo" className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <p className="mb-6 lg:hidden">
            <LogoTaguaro tom="claro" />
          </p>
          {children}
        </div>
      </section>
    </main>
  );
}
