import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="text-sm font-medium text-gold-ink">404</p>
      <h1 className="mt-2 font-display text-4xl">Página não encontrada</h1>
      <p className="mt-3 text-muted">Esse endereço não existe no cadastro.</p>
      <Link
        href="/"
        className="mt-6 inline-flex w-fit rounded-full bg-forest px-4 py-2 text-sm font-medium text-paper"
      >
        Voltar ao painel
      </Link>
    </main>
  );
}
