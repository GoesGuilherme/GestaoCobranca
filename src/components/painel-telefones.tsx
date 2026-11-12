"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import type { PainelTelefonesDTO, NumeroTwilioDTO } from "@/lib/tipos";
import { classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario, classeCampo } from "./estilos";
import { avisarErro, avisarSucesso } from "./notificador";

const STATUS = [
  { valor: "CADASTRADO", rotulo: "Cadastrado" },
  { valor: "PENDENTE", rotulo: "Pendente" },
  { valor: "ATIVO", rotulo: "Ativo" },
  { valor: "INATIVO", rotulo: "Inativo" },
] as const;

function textoEnvio(canal: string, origem: "global" | "empresa") {
  if (origem === "empresa") return `O ${canal} desta empresa sai pela subconta e pelo número padrão ativo.`;
  return `O ${canal} continua saindo pela conta e pelo número globais.`;
}

function mapaTemplates(painel: PainelTelefonesDTO) {
  return Object.fromEntries(painel.templates.map((item) => [item.tipo, item.contentSid ?? ""]));
}

export function PainelTelefones({ inicial }: { inicial: PainelTelefonesDTO }) {
  const router = useRouter();
  const [telefone, setTelefone] = useState("");
  const [canal, setCanal] = useState<"WHATSAPP" | "SMS">("WHATSAPP");
  const [sid, setSid] = useState("");
  const [modelos, setModelos] = useState<Record<string, string>>(() => mapaTemplates(inicial));
  const [enviando, setEnviando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [salvandoModelos, setSalvandoModelos] = useState(false);
  const [atualizandoModelos, setAtualizandoModelos] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const chaveModelos = inicial.templates.map((item) => `${item.tipo}:${item.contentSid ?? ""}:${item.status}`).join("|");
  const modelosAlterados = inicial.templates.some(
    (item) => (modelos[item.tipo] ?? "").trim() !== (item.contentSid ?? ""),
  );
  const temSidSalvo = inicial.templates.some((item) => Boolean(item.contentSid));

  useEffect(() => {
    setModelos(mapaTemplates(inicial));
  }, [chaveModelos, inicial]);

  async function cadastrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    const resposta = await enviarJson("/api/telefones", "POST", { telefone, canal });
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    setTelefone("");
    avisarSucesso("Número cadastrado");
    router.refresh();
  }

  async function vincularSubconta(evento: React.FormEvent) {
    evento.preventDefault();
    setVinculando(true);
    const resposta = await enviarJson("/api/telefones/subconta/vincular", "POST", { subaccountSid: sid.trim() });
    setVinculando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    setSid("");
    avisarSucesso("Subconta vinculada");
    router.refresh();
  }

  async function salvarModelos(evento: React.FormEvent) {
    evento.preventDefault();
    setSalvandoModelos(true);
    const resposta = await enviarJson("/api/telefones/templates", "POST", {
      templates: inicial.templates.map((item) => ({
        tipo: item.tipo,
        contentSid: (modelos[item.tipo] ?? "").trim(),
      })),
    });
    setSalvandoModelos(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Modelos salvos");
    router.refresh();
  }

  async function atualizarStatus() {
    setAtualizandoModelos(true);
    const resposta = await enviarJson("/api/telefones/templates/atualizar", "POST");
    setAtualizandoModelos(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Status atualizado");
    router.refresh();
  }

  async function criarSubconta() {
    setCriando(true);
    const resposta = await enviarJson("/api/telefones/subconta", "POST");
    setCriando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Subconta criada");
    router.refresh();
  }

  async function mudarStatus(numero: NumeroTwilioDTO, status: string) {
    if (status === numero.status) return;
    setOcupado(numero.id);
    const resposta = await enviarJson(`/api/telefones/${numero.id}`, "PATCH", { status });
    setOcupado(null);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Status atualizado");
    router.refresh();
  }

  async function tornarPadrao(numero: NumeroTwilioDTO) {
    setOcupado(numero.id);
    const resposta = await enviarJson(`/api/telefones/${numero.id}`, "PATCH", { padrao: true });
    setOcupado(null);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Número padrão atualizado");
    router.refresh();
  }

  async function remover(numero: NumeroTwilioDTO) {
    setOcupado(numero.id);
    const resposta = await enviarJson(`/api/telefones/${numero.id}`, "DELETE");
    setOcupado(null);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Número removido");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6" aria-labelledby="subconta-titulo">
        <h2 id="subconta-titulo" className="font-display text-2xl">Subconta</h2>
        {inicial.subconta ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="font-medium text-ink">{inicial.subconta.statusRotulo}</dd>
            </div>
            <div>
              <dt className="text-muted">Credencial</dt>
              <dd className="font-medium text-ink">{inicial.subconta.credencialMascarada}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">SID</dt>
              <dd className="break-all font-medium text-ink">{inicial.subconta.sid}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm leading-6 text-muted">
            Sem subconta. Os envios de WhatsApp e SMS continuam na conta e no número globais da Taguaro.
          </p>
        )}
        <p className="text-sm leading-6 text-muted">
          {inicial.criacaoHabilitada
            ? "A criação pela API da Twilio está ligada neste servidor. Ela não compra número."
            : "A criação pela API da Twilio está desligada. O botão recusa e nenhuma chamada sai."}
        </p>
        {inicial.subconta ? null : (
          <button type="button" className={classeBotaoSecundario} disabled={criando} onClick={() => void criarSubconta()}>
            {criando ? "Consultando..." : "Criar subconta"}
          </button>
        )}
        {inicial.subconta ? null : (
          <form onSubmit={vincularSubconta} className="space-y-3 border-t border-line pt-4">
            <h3 className="text-lg font-medium text-ink">Vincular subconta existente</h3>
            <p className="text-sm leading-6 text-muted">
              Não cria subconta e não envia mensagem. A conta pai busca o token do SID informado e o sistema guarda só a cifra.
            </p>
            <label className="block text-sm font-medium text-ink" htmlFor="sid-subconta">
              SID da subconta
              <input
                id="sid-subconta"
                name="subaccountSid"
                value={sid}
                onChange={(evento) => setSid(evento.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="AC…"
                className={`${classeCampo} mt-1`}
                required
              />
            </label>
            <button type="submit" className={classeBotaoPrimario} disabled={vinculando || sid.trim().length < 34}>
              {vinculando ? "Vinculando..." : "Vincular subconta"}
            </button>
          </form>
        )}
        <p className="text-sm leading-6 text-ink">{textoEnvio("WhatsApp", inicial.envioWhatsapp)}</p>
        <p className="text-sm leading-6 text-ink">{textoEnvio("SMS", inicial.envioSms)}</p>
      </section>

      <form onSubmit={salvarModelos} className="max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
        <h2 className="font-display text-2xl">Modelos de WhatsApp</h2>
        <p className="text-sm leading-6 text-muted">
          Informe o ContentSid de cada modelo na subconta. Ao salvar, o status vem da análise da Meta. Só o modelo
          aprovado entra no envio. Se faltar o modelo do tipo, a mensagem segue pelo número oficial.
        </p>
        <div className="space-y-4">
          {inicial.templates.map((modelo) => (
            <div key={modelo.tipo} className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
              <div>
                <label className="text-sm font-medium text-ink" htmlFor={`modelo-${modelo.tipo}`}>
                  {modelo.rotulo}
                </label>
                <p className="text-xs text-muted">{modelo.statusRotulo}</p>
                {modelo.motivo ? <p className="text-xs leading-5 text-clay">{modelo.motivo}</p> : null}
              </div>
              <input
                id={`modelo-${modelo.tipo}`}
                name={modelo.tipo}
                value={modelos[modelo.tipo] ?? ""}
                onChange={(evento) => setModelos((atual) => ({ ...atual, [modelo.tipo]: evento.target.value }))}
                autoComplete="off"
                spellCheck={false}
                placeholder="HX…"
                className={classeCampo}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={classeBotaoPrimario}
            disabled={salvandoModelos || atualizandoModelos || !modelosAlterados}
          >
            {salvandoModelos ? "Salvando..." : "Salvar modelos"}
          </button>
          <button
            type="button"
            className={classeBotaoSecundario}
            disabled={atualizandoModelos || salvandoModelos || !temSidSalvo || modelosAlterados}
            onClick={() => void atualizarStatus()}
          >
            {atualizandoModelos ? "Consultando..." : "Atualizar status"}
          </button>
        </div>
      </form>

      <form onSubmit={cadastrar} className="max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
        <h2 className="font-display text-2xl">Cadastrar número</h2>
        <p className="text-sm leading-6 text-muted">
          O número entra como Cadastrado. Isso não muda o envio. Ele só passa a ser o remetente quando a subconta
          existir e o status estiver Ativo e padrão. Exemplo: +5511999990000.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink" htmlFor="telefone-empresa">
            Número
            <input
              id="telefone-empresa"
              name="telefone"
              value={telefone}
              onChange={(evento) => setTelefone(evento.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+5511999990000"
              className={`${classeCampo} mt-1`}
              required
            />
          </label>
          <label className="block text-sm font-medium text-ink" htmlFor="canal-telefone">
            Canal
            <select
              id="canal-telefone"
              name="canal"
              value={canal}
              onChange={(evento) => setCanal(evento.target.value === "SMS" ? "SMS" : "WHATSAPP")}
              className={`${classeCampo} mt-1`}
            >
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
            </select>
          </label>
        </div>
        <button type="submit" className={classeBotaoPrimario} disabled={enviando || telefone.trim().length < 8}>
          {enviando ? "Salvando..." : "Cadastrar número"}
        </button>
      </form>

      <section className="space-y-3" aria-labelledby="numeros-titulo">
        <h2 id="numeros-titulo" className="font-display text-2xl">Números desta empresa</h2>
        {inicial.numeros.length === 0 ? (
          <p className="max-w-2xl rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-sm leading-6 text-muted">
            Nenhum número cadastrado. A lista fica vazia até o dono incluir um WhatsApp ou um SMS.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-line bg-card">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Números de WhatsApp e SMS da empresa</caption>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Canal</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Padrão</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {inicial.numeros.map((numero) => (
                  <tr key={numero.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-ink">{numero.telefoneE164}</td>
                    <td className="px-4 py-3">{numero.canalRotulo}</td>
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`status-${numero.id}`}>
                        Status de {numero.telefoneE164}
                      </label>
                      <select
                        id={`status-${numero.id}`}
                        value={numero.status}
                        disabled={ocupado === numero.id}
                        onChange={(evento) => void mudarStatus(numero, evento.target.value)}
                        className={classeCampo}
                      >
                        {STATUS.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.rotulo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">{numero.padrao ? "Padrão" : "Não"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {numero.padrao ? null : (
                          <button
                            type="button"
                            className={classeBotaoSecundario}
                            disabled={ocupado === numero.id}
                            onClick={() => void tornarPadrao(numero)}
                          >
                            Tornar padrão
                          </button>
                        )}
                        <button
                          type="button"
                          className={classeBotaoPerigo}
                          disabled={ocupado === numero.id}
                          onClick={() => void remover(numero)}
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
