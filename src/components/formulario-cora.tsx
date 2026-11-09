"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import type { ConfiguracaoCoraDTO } from "@/lib/tipos";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

const RETORNOS: Record<string, string> = {
  conectado: "Conta Cora conectada. As cobranças novas saem pela Cora.",
  conectado_sem_webhook: "Conta conectada. O webhook ainda não foi cadastrado na Cora. Confira CORA_WEBHOOK_SEGREDO e conecte de novo.",
  recusado: "A autorização na Cora foi cancelada. Nada foi gravado.",
  erro: "Não foi possível concluir a conexão com a Cora. Tente de novo.",
  sem_parceiro: "Este ambiente ainda não tem as credenciais de parceria da Cora.",
};

export function FormularioCora({ inicial, retorno }: { inicial: ConfiguracaoCoraDTO; retorno: string | null }) {
  const router = useRouter();
  const [configuracao, setConfiguracao] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const avisoUrl = retorno ? RETORNOS[retorno] : null;

  async function acao(caminho: string, corpo: unknown, sucesso: string) {
    setOcupado(true);
    const resposta = await enviarJson<{ configuracao: ConfiguracaoCoraDTO }>(caminho, "POST", corpo);
    setOcupado(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    setConfiguracao(resposta.dados.configuracao);
    avisarSucesso(sucesso);
    router.refresh();
  }

  async function testar() {
    setOcupado(true);
    const resposta = await enviarJson<{ conta: string }>("/api/integracoes/cora/testar", "POST");
    setOcupado(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(resposta.dados.conta);
  }

  const ambiente = configuracao.ambiente === "PRODUCAO" ? "Produção" : "Testes (Stage)";

  return (
    <section className="grid gap-4 rounded-3xl border border-line bg-card p-6">
      <div>
        <h2 className="font-display text-2xl">Cora</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Parceria Cora, no ambiente de testes. A empresa autoriza a emissão de boleto com Pix. O Taguaro pede só o escopo{" "}
          <span className="font-medium text-ink">invoice</span> e guarda o acesso cifrado. Não inicia pagamento nem transferência.
        </p>
      </div>
      {avisoUrl ? <p className="rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm leading-6">{avisoUrl}</p> : null}
      {configuracao.aviso ? (
        <p className="rounded-2xl border border-line bg-sand px-4 py-3 text-sm leading-6">{configuracao.aviso}</p>
      ) : null}
      {configuracao.provedorAtual === "CORA" ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6">
          As cobranças novas desta empresa saem pela Cora. O que já foi emitido no Asaas ou no Inter continua no provedor de origem.
        </p>
      ) : (
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6">
          Conectar passa a usar a Cora nas cobranças novas. Asaas e Inter desta empresa não são apagados.
        </p>
      )}
      <dl className="grid gap-2 text-sm leading-6 sm:grid-cols-2">
        <div>
          <dt className="text-muted">Ambiente</dt>
          <dd>{ambiente}</dd>
        </div>
        <div>
          <dt className="text-muted">Conta</dt>
          <dd>{configuracao.conectada ? "Conectada" : "Não conectada"}</dd>
        </div>
        <div>
          <dt className="text-muted">Escopo</dt>
          <dd>{configuracao.escopos}</dd>
        </div>
        <div>
          <dt className="text-muted">Provedor das cobranças novas</dt>
          <dd>{configuracao.provedorAtual === "CORA" ? "Cora" : configuracao.provedorAtual === "INTER" ? "Inter" : "Asaas"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-3">
        <a
          className={classeBotaoPrimario}
          href="/api/integracoes/cora/conectar"
          aria-disabled={!configuracao.parceiroConfigurado || ocupado}
        >
          {configuracao.conectada ? "Conectar outra conta" : "Conectar conta Cora"}
        </a>
        {configuracao.conectada && configuracao.provedorAtual !== "CORA" ? (
          <button
            type="button"
            className={classeBotaoSecundario}
            disabled={ocupado}
            onClick={() => acao("/api/integracoes/cora/provedor", { provedor: "CORA" }, "Cobranças novas saem pela Cora")}
          >
            Usar a Cora nas cobranças novas
          </button>
        ) : null}
        {configuracao.conectada ? (
          <button
            type="button"
            className={classeBotaoSecundario}
            disabled={ocupado}
            onClick={() => testar()}
          >
            Testar conexão
          </button>
        ) : null}
      </div>
      <p className="text-sm leading-6 text-muted">
        O aviso de boleto pago, cancelado ou vencido chega sem assinatura. O Taguaro só muda a fatura depois de consultar a invoice na Cora com o acesso desta empresa.
        {configuracao.webhookConfigurado ? " O endpoint de webhook está pronto para cadastro." : ""}
      </p>
      {configuracao.provedorAtual === "CORA" ? (
        <button
          type="button"
          className={classeBotaoSecundario}
          disabled={ocupado}
          onClick={() => acao("/api/integracoes/cora/provedor", { provedor: "ASAAS" }, "As cobranças novas voltam a sair pelo Asaas")}
        >
          Voltar a usar o Asaas nas cobranças novas
        </button>
      ) : null}
      {configuracao.conectada ? (
        <button
          type="button"
          className={classeBotaoSecundario}
          disabled={ocupado}
          onClick={() => acao("/api/integracoes/cora/desconectar", undefined, "Conta Cora desconectada")}
        >
          Desconectar Cora
        </button>
      ) : null}
    </section>
  );
}
