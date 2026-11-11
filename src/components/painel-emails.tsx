"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { dadosAmostraAviso, montarEmailAviso, TIPOS_AVISO_EMAIL, type IdTipoAviso } from "@/lib/email-aviso";
import { dataUrlLogo, LIMITE_LOGO_BYTES, MENSAGEM_LOGO_TAMANHO, validarLogo, type ResumoLogo } from "@/lib/logo";
import { classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

export function PainelEmails({ nomeEmpresa, logo }: { nomeEmpresa: string; logo: ResumoLogo }) {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previaLocal, setPreviaLocal] = useState<string | null>(null);
  const [remover, setRemover] = useState(false);
  const [tipo, setTipo] = useState<IdTipoAviso>("emissao");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setArquivo(null);
    setPreviaLocal(null);
    setRemover(false);
  }, [logo.atualizadoEm, logo.temLogo]);

  const logoCom = previaLocal ?? (logo.caminho && !remover ? logo.caminho : null);
  const amostra = dadosAmostraAviso(tipo, nomeEmpresa);
  const htmlComLogo = montarEmailAviso({ ...amostra, logoUrl: logoCom, modoTeste: false }).html;
  const htmlSemLogo = montarEmailAviso({ ...amostra, logoUrl: null, modoTeste: false }).html;
  const podeSalvar = Boolean(arquivo) || (remover && logo.temLogo);

  async function escolher(lista: FileList | null) {
    const file = lista?.[0];
    if (!file) return;
    if (file.size > LIMITE_LOGO_BYTES) {
      avisarErro(MENSAGEM_LOGO_TAMANHO);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resultado = validarLogo(bytes);
    if (!resultado.ok) {
      avisarErro(resultado.erro);
      return;
    }
    setRemover(false);
    setPreviaLocal(dataUrlLogo(resultado.mime, bytes));
    setArquivo(file);
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeSalvar) return;
    setEnviando(true);
    if (arquivo) {
      const corpo = new FormData();
      corpo.set("logo", arquivo);
      let resposta: Response;
      try {
        resposta = await fetch("/api/empresa/logo", { method: "POST", body: corpo });
      } catch {
        setEnviando(false);
        avisarErro("Não foi possível falar com o servidor.");
        return;
      }
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
      setEnviando(false);
      if (!resposta.ok) {
        avisarErro(dados.erro ?? "Não foi possível salvar a logo.");
        return;
      }
      avisarSucesso("Logo salva");
      router.refresh();
      return;
    }

    const resposta = await enviarJson("/api/empresa/logo", "DELETE");
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Logo removida");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={salvar} className="max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
        <h2 className="font-display text-2xl">Logo da empresa</h2>
        <p className="text-sm leading-6 text-muted">
          PNG ou JPG, até 512 KB. SVG não entra no e-mail. A imagem fica numa URL pública, para o Gmail e o Outlook
          conseguirem abri-la. Cada empresa só altera a própria logo.
        </p>
        <div className="flex min-h-24 items-center gap-4">
          {logoCom ? (
            // data URL da prévia e a URL pública da logo não passam pelo otimizador.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoCom} alt={`Logo de ${nomeEmpresa}`} className="max-h-20 max-w-40 object-contain" />
          ) : (
            <div className="flex h-20 w-40 items-center justify-center rounded-2xl bg-sand text-sm font-medium text-ink">
              {nomeEmpresa}
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="logo-empresa" className={classeBotaoSecundario}>
              {logo.temLogo || arquivo ? "Trocar imagem" : "Escolher imagem"}
              <input
                id="logo-empresa"
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                className="sr-only"
                onChange={(evento) => {
                  void escolher(evento.target.files);
                  evento.target.value = "";
                }}
              />
            </label>
            {logo.temLogo || arquivo ? (
              <button
                type="button"
                className={`${classeBotaoPerigo} ml-2`}
                onClick={() => {
                  setArquivo(null);
                  setPreviaLocal(null);
                  setRemover(true);
                }}
              >
                Remover
              </button>
            ) : null}
          </div>
        </div>
        {arquivo ? <p className="text-sm text-muted">Imagem nova pronta para salvar. A prévia da esquerda já usa ela.</p> : null}
        {remover && logo.temLogo ? <p className="text-sm text-muted">A logo será removida ao salvar.</p> : null}
        <button type="submit" className={classeBotaoPrimario} disabled={!podeSalvar || enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </button>
      </form>

      <section className="space-y-4" aria-labelledby="previa-emails">
        <div>
          <h2 id="previa-emails" className="font-display text-2xl">Pré-visualização</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Os quatro avisos da régua sugerida, com os dados de exemplo. A esquerda acompanha a logo, inclusive antes
            de salvar. A direita mostra o mesmo aviso sem imagem: o nome da empresa fica no cabeçalho. Nada daqui é
            enviado.
          </p>
        </div>
        <div role="tablist" aria-label="Tipo de aviso" className="flex flex-wrap gap-2">
          {TIPOS_AVISO_EMAIL.map((item) => {
            const ligado = item.id === tipo;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={ligado}
                className={ligado ? classeBotaoPrimario : classeBotaoSecundario}
                onClick={() => setTipo(item.id)}
              >
                {item.rotulo}
              </button>
            );
          })}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <MolduraEmail titulo="Com a logo" html={htmlComLogo} />
          <MolduraEmail titulo="Sem a logo" html={htmlSemLogo} />
        </div>
      </section>
    </div>
  );
}

function MolduraEmail({ titulo, html }: { titulo: string; html: string }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-sm font-medium text-ink">{titulo}</figcaption>
      <iframe
        title={`Pré-visualização do e-mail: ${titulo}`}
        srcDoc={html}
        sandbox="allow-same-origin"
        className="h-[640px] w-full rounded-2xl border border-line bg-white"
        onLoad={(evento) => {
          const altura = evento.currentTarget.contentDocument?.documentElement.scrollHeight ?? 0;
          if (altura > 200) evento.currentTarget.style.height = `${altura + 8}px`;
        }}
      />
    </figure>
  );
}
