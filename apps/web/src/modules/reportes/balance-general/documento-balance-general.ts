import { NOMBRES_ESTADOS, type BalanceGeneral, type SeccionEstado } from "@contable/shared";
import { formatearFecha } from "@/lib/formato";
import type { DocumentoEstado, FilaDocumento } from "../exportacion/documento-estado";
import { TEXTOS_BALANCE as T } from "./textos";

function seccion(id: string, s: SeccionEstado): FilaDocumento[] {
  return [
    { id: `${id}-t`, texto: s.titulo, tipo: "seccion" },
    ...s.renglones.map((r, i) => ({
      id: `${id}-${r.codigo || "calculado"}-${i}`,
      texto: r.codigo ? `${r.codigo} · ${r.nombre}` : r.nombre,
      valores: [r.monto],
      tipo: "renglon" as const,
    })),
    { id: `${id}-total`, texto: `Total ${s.titulo.toLowerCase()}`, valores: [s.total], tipo: "total" },
  ];
}

/** El balance general en una sola columna: activo, pasivo y patrimonio, uno debajo del otro (HU-39). */
export function documentoBalanceGeneral(balance: BalanceGeneral): DocumentoEstado {
  const N = NOMBRES_ESTADOS[balance.formato].balance;
  return {
    titulo: balance.titulo,
    periodo: T.alFecha(formatearFecha(balance.fecha)),
    columnas: [{ titulo: "US$", tipo: "dinero" }],
    filas: [
      ...seccion("ac", balance.activoCorriente),
      ...seccion("anc", balance.activoNoCorriente),
      { id: "total-activo", texto: N.totalActivo, valores: [balance.totalActivo], tipo: "resultado" },
      ...seccion("pc", balance.pasivoCorriente),
      ...seccion("pnc", balance.pasivoNoCorriente),
      { id: "total-pasivo", texto: N.totalPasivo, valores: [balance.totalPasivo], tipo: "resultado" },
      ...seccion("pat", balance.patrimonio),
      {
        id: "total-pp",
        texto: N.totalPasivoPatrimonio,
        valores: [balance.totalPasivoPatrimonio],
        tipo: "resultado",
      },
    ],
    nombreHoja: balance.titulo.slice(0, 31),
    nombreArchivo: `balance-general-${balance.fecha}`,
  };
}
