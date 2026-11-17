"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { dadosAmostraAviso, montarEmailAviso, TIPOS_AVISO_EMAIL, type IdTipoAviso } from "@/lib/email-aviso";
import { remetenteAlterado } from "@/lib/formulario-config";
import { dataUrlLogo, LIMITE_LOGO_BYTES, MENSAGEM_LOGO_TAMANHO, validarLogo, type ResumoLogo } from "@/lib/logo";
import { lerConfiguracaoRegua } from "@/lib/regua-cliente";
import type { ConfiguracaoReguaDTO } from "@/lib/tipos";
import { esquemaConfiguracaoRegua, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

export function PainelEmails({
  nomeEmpresa,
  logo,
  config,
}: {
  nomeEmpresa: string;
  logo: ResumoLogo;
  config: ConfiguracaoReguaDTO;
}) {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previaLocal, setPreviaLocal] = useState<string | null>(null);
  const [remover, setRemover] = useState(false);
  const [tipo, setTipo] = useState<IdTipoAviso>("emissao");
  const [enviando, setEnviando] = useState(false);
  const [remetenteNome, setRemetenteNome] = useState(config.remetenteNome);
  const [remetenteEmail, setRemetenteEmail] = useState(config.remetenteEmail);
  const [replyTo, setReplyTo] = useState(config.replyTo);
  const [chave, setChave] = useState("");
  const [configurada, setConfigurada] = useState(config.configurada);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [salvandoRemetente, setSalvandoRemetente] = useState(false);
  const [testando, setTestando] = useState(false);
  const [remetenteSalvo, setRemetenteSalvo] = useState({
    nome: config.remetenteNome,
    email: config.remetenteEmail,
    reply: config.replyTo,
  });
  const podeSalvarRemetente = remetenteAlterado(
    { nome: remetenteNome, email: remetenteEmail, reply: replyTo, chave },
    remetenteSalvo,
  );

  useEffect(() => {
    const salvo = { nome: config.remetenteNome, email: config.remetenteEmail, reply: config.replyTo };
    setRemetenteSalvo(salvo);
    setRemetenteNome(config.remetenteNome);
    setRemetenteEmail(config.remetenteEmail);
    setReplyTo(config.replyTo);
    setConfigurada(config.configurada);
    setChave("");
  }, [config.remetenteNome, config.remetenteEmail, config.replyTo, config.configurada]);

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

  async function salvarRemetente(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeSalvarRemetente || salvandoRemetente) return;
    setSalvandoRemetente(true);
    const atual = await lerConfiguracaoRegua();
    if (!atual) {
      setSalvandoRemetente(false);
      avisarErro("Não foi possível ler a régua para guardar o remetente.");
      return;
    }
    const corpo = {
      ativa: atual.ativa,
      modoTeste: atual.modoTeste,
      remetenteNome,
      remetenteEmail,
      replyTo,
      chaveResend: chave,
    };
    const validado = esquemaConfiguracaoRegua.safeParse(corpo);
    if (!validado.success) {
      setSalvandoRemetente(false);
      setCampos(mensagensDoZod(validado.error));
      avisarCamposObrigatorios();
      return;
    }
    setCampos({});
    const resposta = await enviarJson<{ config: ConfiguracaoReguaDTO }>("/api/regua/config", "POST", corpo);
    setSalvandoRemetente(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    const salvo = {
      nome: resposta.dados.config.remetenteNome,
      email: resposta.dados.config.remetenteEmail,
      reply: resposta.dados.config.replyTo,
    };
    setRemetenteSalvo(salvo);
    setRemetenteNome(salvo.nome);
    setRemetenteEmail(salvo.email);
    setReplyTo(salvo.reply);
    setChave("");
    setConfigurada(resposta.dados.config.configurada);
    avisarSucesso("Remetente salvo");
    router.refresh();
  }

  async function testarEmail() {
    if (testando || salvandoRemetente) return;
    setTestando(true);
    const resposta = await enviarJson<{ enviado: boolean }>("/api/regua/teste-email", "POST");
    setTestando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("E-mail de teste enviado");
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
      <form onSubmit={salvarRemetente} className="max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
        <h2 className="font-display text-2xl">Remetente</h2>
        <p className="text-sm leading-6 text-muted">
          Nome e e-mail que aparecem nos avisos da régua. A chave fica guardada de forma protegida e esta tela não
          mostra ela de novo. O teste usa só o que já está salvo e vai para o dono.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo label="Nome do remetente" htmlFor="resend-nome">
            <input
              id="resend-nome"
              className={classeCampo}
              value={remetenteNome}
              onChange={(evento) => setRemetenteNome(evento.target.value)}
            />
          </Campo>
          <Campo
            label="E-mail do remetente"
            htmlFor="resend-email"
            erro={campos.remetenteEmail}
            dica="Se ficar vazio, os e-mails saem de cobranca@taguaro.com.br. O domínio precisa estar liberado para envio."
          >
            <input
              id="resend-email"
              className={classeCampo}
              value={remetenteEmail}
              onChange={(evento) => setRemetenteEmail(evento.target.value)}
            />
          </Campo>
          <Campo label="Responder para" htmlFor="resend-reply" erro={campos.replyTo}>
            <input
              id="resend-reply"
              className={classeCampo}
              value={replyTo}
              onChange={(evento) => setReplyTo(evento.target.value)}
            />
          </Campo>
          <Campo
            label="Chave da Resend"
            htmlFor="resend-chave"
            erro={campos.chaveResend}
            dica="Fica guardada de forma protegida. Deixe em branco para manter a chave atual."
          >
            <input
              id="resend-chave"
              className={classeCampo}
              type="password"
              autoComplete="new-password"
              value={chave}
              placeholder={configurada ? "Deixe em branco para manter" : "Cole a chave"}
              onChange={(evento) => setChave(evento.target.value)}
            />
          </Campo>
        </div>
        <p id="resend-estado" className="text-sm font-medium">
          {configurada ? "Chave configurada" : "Chave não configurada"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={classeBotaoPrimario} disabled={!podeSalvarRemetente || salvandoRemetente || testando}>
            {salvandoRemetente ? "Salvando..." : "Salvar"}
          </button>
          <button
            id="regua-teste-email"
            type="button"
            className={classeBotaoSecundario}
            disabled={testando || salvandoRemetente}
            onClick={() => void testarEmail()}
          >
            {testando ? "Enviando..." : "Enviar e-mail de teste"}
          </button>
        </div>
      </form>

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
