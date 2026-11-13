"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { textoEmv } from "@/lib/pix-brcode";
import { salvarPixHabilitado } from "@/lib/pix-formulario";
import { TIPOS_CHAVE_PIX, type RascunhoPix } from "@/lib/pix-chave";
import { mensagensDoZod, esquemaConfiguracaoPix } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

const ROTULOS: Record<(typeof TIPOS_CHAVE_PIX)[number], string> = {
  CPF: "CPF",
  CNPJ: "CNPJ",
  EMAIL: "E-mail",
  TELEFONE: "Telefone",
  EVP: "Chave aleatória",
};

export function FormularioPixProprio({ inicial }: { inicial: RascunhoPix & { configurado: boolean; provedorAtual: string } }) {
  const router = useRouter();
  const base: RascunhoPix = {
    tipoChave: inicial.tipoChave,
    chavePix: inicial.chavePix,
    nomeRecebedor: inicial.nomeRecebedor,
    cidadeRecebedor: inicial.cidadeRecebedor,
    usarNasCobrancas: inicial.usarNasCobrancas,
  };
  const [valores, setValores] = useState<RascunhoPix>(base);
  const [gravado, setGravado] = useState<RascunhoPix>(base);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const podeSalvar = salvarPixHabilitado(valores, gravado);
  const nomeQr = textoEmv(valores.nomeRecebedor, 25);
  const cidadeQr = textoEmv(valores.cidadeRecebedor, 15);

  function atualizar(parcial: Partial<RascunhoPix>) {
    setValores((atual) => ({ ...atual, ...parcial }));
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !podeSalvar) return;
    const validado = esquemaConfiguracaoPix.safeParse(valores);
    if (!validado.success) {
      setCampos(mensagensDoZod(validado.error));
      avisarCamposObrigatorios();
      return;
    }
    setEnviando(true);
    const resposta = await enviarJson<{ configuracao: RascunhoPix & { configurado: boolean } }>(
      "/api/banco/pix",
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
    const salvo: RascunhoPix = {
      tipoChave: resposta.dados.configuracao.tipoChave,
      chavePix: resposta.dados.configuracao.chavePix,
      nomeRecebedor: resposta.dados.configuracao.nomeRecebedor,
      cidadeRecebedor: resposta.dados.configuracao.cidadeRecebedor,
      usarNasCobrancas: resposta.dados.configuracao.usarNasCobrancas,
    };
    setValores(salvo);
    setGravado(salvo);
    setCampos({});
    avisarSucesso("Chave Pix salva");
    router.refresh();
  }

  return (
    <form onSubmit={(evento) => void salvar(evento)} className="grid gap-4 rounded-3xl border border-line bg-card p-6">
      <div>
        <h2 className="font-display text-2xl">Pix da empresa</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Cobrança com a chave Pix da própria empresa, sem Asaas, Cora ou Inter. O QR Code segue o padrão do Banco Central.
          A cidade entra no código e precisa ser a cidade do recebedor.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Tipo da chave" htmlFor="pix-tipo" erro={campos.tipoChave} obrigatorio>
          <select
            id="pix-tipo"
            className={classeCampo}
            value={valores.tipoChave}
            onChange={(evento) => atualizar({ tipoChave: evento.target.value })}
          >
            {TIPOS_CHAVE_PIX.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULOS[tipo]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Chave Pix" htmlFor="pix-chave" erro={campos.chavePix} obrigatorio>
          <input
            id="pix-chave"
            className={classeCampo}
            value={valores.chavePix}
            autoComplete="off"
            onChange={(evento) => atualizar({ chavePix: evento.target.value })}
          />
        </Campo>
        <Campo label="Nome de quem recebe" htmlFor="pix-nome" erro={campos.nomeRecebedor} obrigatorio dica="Até 25 caracteres no QR, sem acento.">
          <input
            id="pix-nome"
            className={classeCampo}
            value={valores.nomeRecebedor}
            maxLength={80}
            onChange={(evento) => atualizar({ nomeRecebedor: evento.target.value })}
          />
        </Campo>
        <Campo
          label="Cidade do recebedor"
          htmlFor="pix-cidade"
          erro={campos.cidadeRecebedor}
          obrigatorio
          dica="Obrigatória no BR Code. Até 15 caracteres no QR."
        >
          <input
            id="pix-cidade"
            className={classeCampo}
            value={valores.cidadeRecebedor}
            maxLength={40}
            placeholder="Santos"
            onChange={(evento) => atualizar({ cidadeRecebedor: evento.target.value })}
          />
        </Campo>
      </div>
      {nomeQr && cidadeQr ? (
        <p className="text-sm text-muted">
          No QR Code: {nomeQr} · {cidadeQr}
        </p>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={valores.usarNasCobrancas}
          onChange={(evento) => atualizar({ usarNasCobrancas: evento.target.checked })}
        />
        <span>
          Usar este Pix nas cobranças novas. Asaas, Cora e Inter continuam cadastrados e voltam a valer se esta opção for
          desligada. Provedor atual: {inicial.provedorAtual}.
        </span>
      </label>
      <div>
        <button type="submit" className={classeBotaoPrimario} disabled={enviando || !podeSalvar}>
          {enviando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
