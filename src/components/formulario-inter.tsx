"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { AMBIENTES_ASAAS } from "@/lib/rotulos";
import type { ConfiguracaoInterDTO } from "@/lib/tipos";
import { esquemaConfiguracaoInter, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

function lerArquivo(arquivo: File | undefined, aplicar: (texto: string) => void) {
  if (!arquivo) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    if (typeof leitor.result === "string") aplicar(leitor.result);
  };
  leitor.readAsText(arquivo);
}

export function FormularioInter({ inicial }: { inicial: ConfiguracaoInterDTO }) {
  const router = useRouter();
  const [configuracao, setConfiguracao] = useState(inicial);
  const [ambiente, setAmbiente] = useState<"SANDBOX" | "PRODUCAO">(inicial.ambiente ?? "SANDBOX");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [contaCorrente, setContaCorrente] = useState(inicial.contaCorrente ?? "");
  const [certificadoPem, setCertificadoPem] = useState("");
  const [chavePrivadaPem, setChavePrivadaPem] = useState("");
  const [nomeCertificado, setNomeCertificado] = useState("");
  const [nomeChave, setNomeChave] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [testando, setTestando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    const validado = esquemaConfiguracaoInter.safeParse({
      ambiente,
      clientId,
      clientSecret,
      contaCorrente,
      certificadoPem,
      chavePrivadaPem,
    });
    if (!validado.success) {
      setCampos(mensagensDoZod(validado.error));
      avisarCamposObrigatorios();
      return;
    }
    setCampos({});
    setEnviando(true);
    const resposta = await enviarJson<{ configuracao: ConfiguracaoInterDTO }>("/api/banco/inter", "POST", validado.data);
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    setConfiguracao(resposta.dados.configuracao);
    setClientId("");
    setClientSecret("");
    setCertificadoPem("");
    setChavePrivadaPem("");
    setNomeCertificado("");
    setNomeChave("");
    setContaCorrente(resposta.dados.configuracao.contaCorrente ?? "");
    avisarSucesso("Banco Inter salvo");
    router.refresh();
  }

  async function testar() {
    setTestando(true);
    const resposta = await enviarJson<{ conta: string }>("/api/banco/inter/testar", "POST");
    setTestando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(`Conexão aceita. ${resposta.dados.conta}`);
  }

  async function voltarAsaas() {
    const resposta = await enviarJson<{ configuracao: ConfiguracaoInterDTO }>("/api/banco/inter", "POST", {
      provedor: "ASAAS",
    });
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    setConfiguracao(resposta.dados.configuracao);
    avisarSucesso("As cobranças novas voltam a sair pelo Asaas");
    router.refresh();
  }

  const validade = configuracao.certificadoValidoAte
    ? new Date(configuracao.certificadoValidoAte).toLocaleDateString("pt-BR")
    : null;

  return (
    <div className="grid gap-6">
      {configuracao.provedorAtual === "INTER" ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6">
          As cobranças novas desta empresa saem pelo Inter. O que já foi emitido no Asaas continua no Asaas.
        </p>
      ) : (
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6">
          Salvar abaixo passa a usar o Inter nas cobranças novas. O Asaas desta empresa não é apagado.
        </p>
      )}
      {configuracao.aviso ? (
        <p className="rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm leading-6">{configuracao.aviso}</p>
      ) : null}
      <form onSubmit={salvar} className="grid gap-4 rounded-3xl border border-line bg-card p-6">
        <Campo label="Ambiente" htmlFor="ambiente-inter" erro={campos.ambiente} dica="Sandbox e produção têm certificado e chaves diferentes.">
          <select
            id="ambiente-inter"
            className={classeCampo}
            value={ambiente}
            onChange={(evento) => setAmbiente(evento.target.value as "SANDBOX" | "PRODUCAO")}
          >
            {AMBIENTES_ASAAS.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          label="Client ID"
          htmlFor="client-id-inter"
          erro={campos.clientId}
          dica={configuracao.clientIdMascarado ? `Guardado: ${configuracao.clientIdMascarado}. Deixe em branco para manter.` : "O Inter mostra o client id no detalhe da integração."}
        >
          <input
            id="client-id-inter"
            type="password"
            autoComplete="off"
            className={classeCampo}
            value={clientId}
            onChange={(evento) => setClientId(evento.target.value)}
          />
        </Campo>
        <Campo
          label="Client secret"
          htmlFor="client-secret-inter"
          erro={campos.clientSecret}
          dica="Fica cifrado. A tela não mostra o segredo de volta."
        >
          <input
            id="client-secret-inter"
            type="password"
            autoComplete="off"
            className={classeCampo}
            value={clientSecret}
            onChange={(evento) => setClientSecret(evento.target.value)}
          />
        </Campo>
        <Campo
          label="Conta corrente"
          htmlFor="conta-inter"
          erro={campos.contaCorrente}
          dica="Só números, com o dígito e sem zeros à esquerda. Vai no cabeçalho x-conta-corrente."
        >
          <input
            id="conta-inter"
            inputMode="numeric"
            autoComplete="off"
            className={classeCampo}
            value={contaCorrente}
            onChange={(evento) => setContaCorrente(evento.target.value)}
          />
        </Campo>
        <Campo
          label="Certificado (.crt)"
          htmlFor="certificado-inter"
          erro={campos.certificadoPem}
          dica={configuracao.temCertificado ? "Já há um certificado guardado. Envie outro só para trocar." : "Arquivo baixado pelo usuário Master no Internet Banking."}
        >
          <input
            id="certificado-inter"
            type="file"
            accept=".crt,.pem,.cer,text/plain"
            className={classeCampo}
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              setNomeCertificado(arquivo?.name ?? "");
              lerArquivo(arquivo, setCertificadoPem);
            }}
          />
        </Campo>
        {nomeCertificado ? <p className="text-sm text-muted">Arquivo lido neste navegador: {nomeCertificado}. Ele não volta para a tela depois de salvar.</p> : null}
        <Campo
          label="Chave privada (.key)"
          htmlFor="chave-inter"
          erro={campos.chavePrivadaPem}
          dica="A chave privada fica cifrada e não é exibida de novo."
        >
          <input
            id="chave-inter"
            type="file"
            accept=".key,.pem,text/plain"
            className={classeCampo}
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              setNomeChave(arquivo?.name ?? "");
              lerArquivo(arquivo, setChavePrivadaPem);
            }}
          />
        </Campo>
        {nomeChave ? <p className="text-sm text-muted">Arquivo lido neste navegador: {nomeChave}.</p> : null}
        {validade ? (
          <p className="text-sm leading-6 text-muted">
            Certificado válido até {validade}.
            {configuracao.certificadoVencido ? " Ele já venceu." : ""}
            {configuracao.certificadoPertoDoVencimento ? " O vencimento está perto: gere outro no Inter." : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
            {enviando ? "Salvando..." : "Salvar e usar o Inter"}
          </button>
          <button type="button" className={classeBotaoSecundario} onClick={testar} disabled={testando || !configuracao.configurado}>
            {testando ? "Testando..." : "Testar conexão"}
          </button>
        </div>
      </form>
      {configuracao.urlWebhook ? (
        <section className="rounded-3xl border border-line bg-card p-6">
          <h2 className="font-display text-2xl">Webhook</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            O Inter avisa cobrança paga, cancelada ou expirada. O Taguaro só dá baixa depois de consultar a cobrança na API. O endereço completo, com o segredo, fica só no cadastro do Inter. Aqui ele aparece sem o segredo. A URL antiga continua valendo.
          </p>
          <p className="mt-4 break-all rounded-2xl bg-sand px-4 py-3 font-mono text-sm">{configuracao.urlWebhook}</p>
        </section>
      ) : null}
      {configuracao.provedorAtual === "INTER" ? (
        <button type="button" className={classeBotaoSecundario} onClick={voltarAsaas}>
          Voltar a usar o Asaas nas cobranças novas
        </button>
      ) : null}
    </div>
  );
}
