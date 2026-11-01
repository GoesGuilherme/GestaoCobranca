"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { asaasAposSalvar } from "@/lib/apos-salvar";
import { enviarJson } from "@/lib/api-cliente";
import { AMBIENTES_ASAAS } from "@/lib/rotulos";
import type { ConfiguracaoAsaasDTO } from "@/lib/tipos";
import { esquemaConfiguracaoAsaas, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

export function FormularioAsaas({ inicial }: { inicial: ConfiguracaoAsaasDTO }) {
  const router = useRouter();
  const [ambiente, setAmbiente] = useState(inicial.ambiente ?? "SANDBOX");
  const [chaveApi, setChaveApi] = useState("");
  const [configuracao, setConfiguracao] = useState(inicial);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!configuracao.configurado && !chaveApi.trim()) {
      setCampos({ chaveApi: "Informe a chave da API." });
      avisarCamposObrigatorios();
      return;
    }
    const validado = esquemaConfiguracaoAsaas.safeParse({ ambiente, chaveApi });
    if (!validado.success) {
      setCampos(mensagensDoZod(validado.error));
      avisarCamposObrigatorios();
      return;
    }
    setCampos({});
    setEnviando(true);
    const resposta = await enviarJson<{ configuracao: ConfiguracaoAsaasDTO }>(
      "/api/asaas/configuracao",
      "POST",
      validado.data,
    );
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
    const gravado = asaasAposSalvar(ambiente);
    setConfiguracao(resposta.dados.configuracao);
    setAmbiente(gravado.ambiente as "SANDBOX" | "PRODUCAO");
    setChaveApi(gravado.chaveApi);
    avisarSucesso("Configurações salvas");
    router.refresh();
  }

  async function testar() {
    setTestando(true);
    const resposta = await enviarJson<{ conta: string }>("/api/asaas/testar", "POST");
    setTestando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(`Conexão aceita. Conta: ${resposta.dados.conta}`);
  }

  async function regenerar() {
    const resposta = await enviarJson<{ configuracao: ConfiguracaoAsaasDTO }>("/api/asaas/token", "POST");
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    setConfiguracao(resposta.dados.configuracao);
    setCopiado(false);
    avisarSucesso("Token do webhook gerado");
  }

  async function copiar() {
    if (!configuracao.tokenWebhook) return;
    try {
      await navigator.clipboard.writeText(configuracao.tokenWebhook);
      setCopiado(true);
    } catch {
      avisarErro("Não foi possível copiar. Selecione o token e copie manualmente.");
    }
  }

  return (
    <div className="grid gap-6">
      {configuracao.simulado ? (
        <p className="rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm">
          Modo simulado neste computador. Nenhuma chamada sai para o Asaas. Não ligue isso em produção.
        </p>
      ) : null}
      <form onSubmit={salvar} className="grid gap-4 rounded-3xl border border-line bg-card p-6">
        <Campo label="Ambiente" htmlFor="ambiente-asaas" erro={campos.ambiente} dica="A chave de sandbox não funciona em produção, e o contrário também.">
          <select id="ambiente-asaas" className={classeCampo} value={ambiente} onChange={(evento) => setAmbiente(evento.target.value as "SANDBOX" | "PRODUCAO")}>
            {AMBIENTES_ASAAS.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          label="Chave da API"
          htmlFor="chave-asaas"
          erro={campos.chaveApi}
          dica={configuracao.chaveMascarada ? `Chave guardada: ${configuracao.chaveMascarada}. Deixe em branco para mantê-la.` : "Cole a chave do ambiente escolhido. Ela fica cifrada e não volta para a tela."}
        >
          <input
            id="chave-asaas"
            type="password"
            autoComplete="off"
            className={classeCampo}
            value={chaveApi}
            onChange={(evento) => setChaveApi(evento.target.value)}
            placeholder={configuracao.configurado ? "••••" : ""}
          />
        </Campo>
        {configuracao.aviso ? <p className="text-sm text-clay">{configuracao.aviso}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
            {enviando ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" className={classeBotaoSecundario} onClick={testar} disabled={testando || !configuracao.configurado}>
            {testando ? "Testando..." : "Testar conexão"}
          </button>
        </div>
      </form>

      {configuracao.tokenWebhook ? (
        <section className="rounded-3xl border border-line bg-card p-6">
          <h2 className="font-display text-2xl">Webhook</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            No painel do Asaas, em Integrações → Webhooks, crie um webhook com a URL pública desta aplicação terminada em <span className="font-medium text-ink">/api/webhooks/asaas</span>. Cole o token abaixo no campo de autenticação. O Asaas envia esse valor no cabeçalho <span className="font-medium text-ink">asaas-access-token</span>.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Marque os eventos de cobrança: PAYMENT_CREATED, PAYMENT_UPDATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_RESTORED, PAYMENT_REFUNDED e PAYMENT_PARTIALLY_REFUNDED. Sandbox e produção são configurações separadas. O token tem mais de 32 caracteres e não é a chave da API.
          </p>
          <p className="mt-4 break-all rounded-2xl bg-sand px-4 py-3 font-mono text-sm">{configuracao.tokenWebhook}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={classeBotaoSecundario} onClick={copiar}>
              {copiado ? "Copiado" : "Copiar token"}
            </button>
            <button type="button" className={classeBotaoSecundario} onClick={regenerar}>
              Gerar outro token
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
