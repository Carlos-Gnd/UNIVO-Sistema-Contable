import type { EstadoComparativo, PeriodoComparativo } from "@contable/shared";
import { formatearFecha } from "@/lib/formato";
import type { DocumentoEstado } from "../exportacion/documento-estado";
import { TEXTOS_ESTADOS_ADICIONALES as T } from "./textos";

const C = T.comparativo;

/** Rótulo de un período: «01/10/2026 al 31/10/2026» o «Al 31/10/2026» en el balance. */
export const etiquetaPeriodo = (p: PeriodoComparativo) =>
  C.periodo(p.desde ? formatearFecha(p.desde) : null, formatearFecha(p.hasta));

/** Porcentaje de variación como lo ve el usuario: «50.00 %» o «n/a» si el período B está en cero. */
export const textoPorcentaje = (porcentaje: string | null | undefined) =>
  porcentaje === null || porcentaje === undefined ? C.sinBase : `${porcentaje} %`;

/** El estado comparativo como documento exportable: período A, período B, variación y porcentaje. */
export function documentoComparativo(c: EstadoComparativo): DocumentoEstado {
  const a = etiquetaPeriodo(c.periodoA);
  const b = etiquetaPeriodo(c.periodoB);
  return {
    titulo: C.titulo(c.titulo),
    periodo: C.frente(a, b),
    columnas: [
      { titulo: a, tipo: "dinero" },
      { titulo: b, tipo: "dinero" },
      { titulo: C.variacion, tipo: "dinero" },
      { titulo: C.variacionPorcentual, tipo: "texto" },
    ],
    filas: c.filas.map((f) => ({
      id: f.id,
      texto: f.codigo ? `${f.codigo} · ${f.texto}` : f.texto,
      tipo: f.tipo,
      ...(f.tipo === "seccion"
        ? {}
        : {
            valores: [
              f.periodoA ?? "0.00",
              f.periodoB ?? "0.00",
              f.variacion ?? "0.00",
              textoPorcentaje(f.porcentaje),
            ],
          }),
    })),
    nombreHoja: C.titulo(c.titulo).slice(0, 31),
    nombreArchivo: `${C.nombreArchivo}-${c.estado}-${c.periodoA.hasta}-${c.periodoB.hasta}`,
  };
}
