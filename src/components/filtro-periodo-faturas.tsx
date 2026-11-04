"use client";

import { useState } from "react";
import { CAMPOS_PERIODO_FATURA, PERIODOS_FATURA, type FiltroPeriodoFatura } from "@/lib/periodo-faturas";
import { classeCampo } from "./estilos";

const classeRotulo = "grid w-full gap-1 text-sm sm:w-auto";

export function FiltroPeriodoFaturas({ filtro }: { filtro: FiltroPeriodoFatura }) {
  const [periodo, setPeriodo] = useState(filtro.periodo);
  const [de, setDe] = useState(filtro.de);
  const [ate, setAte] = useState(filtro.ate);
  const personalizado = periodo === "personalizado";

  return (
    <>
      <label className={classeRotulo}>
        <span className="font-medium">Período</span>
        <select
          name="periodo"
          value={periodo}
          className={classeCampo}
          onChange={(evento) => setPeriodo(evento.target.value as FiltroPeriodoFatura["periodo"])}
        >
          {PERIODOS_FATURA.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className={classeRotulo}>
        <span className="font-medium">Data</span>
        <select name="por" defaultValue={filtro.campo} className={classeCampo}>
          {CAMPOS_PERIODO_FATURA.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className={personalizado ? classeRotulo : "hidden"}>
        <span className="font-medium">De</span>
        <input
          type="date"
          name="de"
          value={de}
          disabled={!personalizado}
          className={classeCampo}
          onChange={(evento) => setDe(evento.target.value)}
        />
      </label>
      <label className={personalizado ? classeRotulo : "hidden"}>
        <span className="font-medium">Até</span>
        <input
          type="date"
          name="ate"
          value={ate}
          disabled={!personalizado}
          className={classeCampo}
          onChange={(evento) => setAte(evento.target.value)}
        />
      </label>
    </>
  );
}
