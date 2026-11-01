"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLIENTE_VAZIO, valoresAposSalvar } from "@/lib/apos-salvar";
import { enviarJson } from "@/lib/api-cliente";
import { dataHojeIso } from "@/lib/data";
import { mascararDocumentoDigitando, mascararTelefoneDigitando } from "@/lib/mascaras";
import { SEGMENTOS, STATUS_CLIENTE } from "@/lib/rotulos";
import type { ClienteResumo } from "@/lib/tipos";
import { UFS } from "@/lib/ufs";
import { esquemaCliente, mensagemDoCampo, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

type Valores = {
  nomeFantasia: string;
  razaoSocial: string;
  documento: string;
  segmento: string;
  contatoNome: string;
  whatsapp: string;
  email: string;
  cidade: string;
  uf: string;
  status: string;
  ativadoEm: string;
  observacoes: string;
};

const vazio: Valores = CLIENTE_VAZIO;

export function FormularioCliente({
  cliente,
  podeBloquear = false,
}: {
  cliente?: ClienteResumo;
  podeBloquear?: boolean;
}) {
  const router = useRouter();
  const bloqueadoTravado = cliente?.status === "BLOQUEADO" && !podeBloquear;
  const statusOpcoes = STATUS_CLIENTE.filter(
    (item) => item.valor !== "BLOQUEADO" || podeBloquear || bloqueadoTravado,
  );
  const [valores, setValores] = useState<Valores>(
    cliente
      ? {
          nomeFantasia: cliente.nomeFantasia,
          razaoSocial: cliente.razaoSocial,
          documento: mascararDocumentoDigitando(cliente.documento),
          segmento: cliente.segmento,
          contatoNome: cliente.contatoNome,
          whatsapp: mascararTelefoneDigitando(cliente.whatsapp),
          email: cliente.email,
          cidade: cliente.cidade,
          uf: cliente.uf,
          status: cliente.status,
          ativadoEm: cliente.ativadoEm ?? "",
          observacoes: cliente.observacoes ?? "",
        }
      : vazio,
  );
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  function alterar(nome: keyof Valores, valor: string) {
    setValores((atual) => ({ ...atual, [nome]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaCliente.safeParse(valores);
    if (!resultado.success) {
      setCampos(mensagensDoZod(resultado.error));
      avisarCamposObrigatorios();
      return;
    }

    setEnviando(true);
    setCampos({});
    const resposta = await enviarJson<{ cliente: ClienteResumo }>(
      cliente ? `/api/clientes/${cliente.id}` : "/api/clientes",
      cliente ? "PATCH" : "POST",
      resultado.data,
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

    setValores((atual) => valoresAposSalvar(cliente ? "editar" : "criar", atual, vazio));
    if (cliente) {
      avisarSucesso("Cliente salvo", { aposNavegar: true });
      router.push(`/clientes/${resposta.dados.cliente.id}`);
    } else {
      avisarSucesso("Cliente salvo");
    }
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-5 md:p-7">
      <div className="grid gap-5 md:grid-cols-2">
        <Campo label="Nome fantasia" htmlFor="nomeFantasia" erro={campos.nomeFantasia}>
          <input
            id="nomeFantasia"
            className={classeCampo}
            value={valores.nomeFantasia}
            onChange={(evento) => alterar("nomeFantasia", evento.target.value)}
          />
        </Campo>
        <Campo label="Razão social" htmlFor="razaoSocial" erro={campos.razaoSocial}>
          <input
            id="razaoSocial"
            className={classeCampo}
            value={valores.razaoSocial}
            onChange={(evento) => alterar("razaoSocial", evento.target.value)}
          />
        </Campo>
        <Campo
          label="CPF ou CNPJ"
          htmlFor="documento"
          erro={campos.documento}
          dica="Pode colar com ou sem pontuação. O CNPJ alfanumérico também é aceito."
        >
          <input
            id="documento"
            className={classeCampo}
            value={valores.documento}
            onChange={(evento) => alterar("documento", mascararDocumentoDigitando(evento.target.value))}
            onBlur={() =>
              setCampos((atual) => ({
                ...atual,
                documento: mensagemDoCampo(esquemaCliente.shape.documento, valores.documento),
              }))
            }
            inputMode="text"
            autoComplete="off"
          />
        </Campo>
        <Campo label="Segmento" htmlFor="segmento" erro={campos.segmento}>
          <select
            id="segmento"
            className={classeCampo}
            value={valores.segmento}
            onChange={(evento) => alterar("segmento", evento.target.value)}
          >
            {SEGMENTOS.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Contato principal" htmlFor="contatoNome" erro={campos.contatoNome}>
          <input
            id="contatoNome"
            className={classeCampo}
            value={valores.contatoNome}
            onChange={(evento) => alterar("contatoNome", evento.target.value)}
          />
        </Campo>
        <Campo label="WhatsApp" htmlFor="whatsapp" erro={campos.whatsapp} dica="Com DDD. Exemplo: (13) 98888-1001">
          <input
            id="whatsapp"
            className={classeCampo}
            value={valores.whatsapp}
            autoComplete="tel"
            onChange={(evento) => alterar("whatsapp", mascararTelefoneDigitando(evento.target.value))}
            onBlur={() =>
              setCampos((atual) => ({
                ...atual,
                whatsapp: mensagemDoCampo(esquemaCliente.shape.whatsapp, valores.whatsapp),
              }))
            }
            inputMode="tel"
          />
        </Campo>
        <Campo label="E-mail" htmlFor="email" erro={campos.email}>
          <input
            id="email"
            type="email"
            className={classeCampo}
            value={valores.email}
            onChange={(evento) => alterar("email", evento.target.value)}
          />
        </Campo>
        <Campo label="Status" htmlFor="status" erro={campos.status}>
          <select
            id="status"
            className={classeCampo}
            value={valores.status}
            disabled={bloqueadoTravado}
            onChange={(evento) => alterar("status", evento.target.value)}
          >
            {statusOpcoes.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          label="Data de ativação"
          htmlFor="ativadoEm"
          erro={campos.ativadoEm}
          dica="Quando esta pessoa passou a ser cliente. Pode ficar em branco."
        >
          <input
            id="ativadoEm"
            type="date"
            className={classeCampo}
            value={valores.ativadoEm}
            max={dataHojeIso()}
            onChange={(evento) => alterar("ativadoEm", evento.target.value)}
          />
        </Campo>
        <Campo label="Cidade" htmlFor="cidade" erro={campos.cidade}>
          <input
            id="cidade"
            className={classeCampo}
            value={valores.cidade}
            onChange={(evento) => alterar("cidade", evento.target.value)}
          />
        </Campo>
        <Campo label="UF" htmlFor="uf" erro={campos.uf}>
          <select
            id="uf"
            className={classeCampo}
            value={valores.uf}
            onChange={(evento) => alterar("uf", evento.target.value)}
          >
            {UFS.map(([sigla, nome]) => (
              <option key={sigla} value={sigla}>
                {sigla} — {nome}
              </option>
            ))}
          </select>
        </Campo>
        <div className="md:col-span-2">
          <Campo label="Observações" htmlFor="observacoes" erro={campos.observacoes}>
            <textarea
              id="observacoes"
              className={`${classeCampo} min-h-28 resize-y`}
              value={valores.observacoes}
              onChange={(evento) => alterar("observacoes", evento.target.value)}
            />
          </Campo>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
          {enviando ? "Salvando..." : cliente ? "Salvar alterações" : "Cadastrar cliente"}
        </button>
        <Link href={cliente ? `/clientes/${cliente.id}` : "/clientes"} className={classeBotaoSecundario}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
