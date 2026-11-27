import { NOMBRES_ESTADOS, type ActividadFlujo, type EstadoFlujoEfectivo } from "@contable/shared";
import { formatearFecha } from "@/lib/formato";
import type { DocumentoEstado, FilaDocumento } from "../exportacion/documento-estado";
import { TEXTOS_ESTADOS_ADICIONALES as T } from "./textos";

/** Las filas de una actividad: su encabezado, sus renglones y el efectivo neto que genera. */
function filasDeActividad(clave: string, a: ActividadFlujo, total: string): FilaDocumento[] {
  return [
    { id: `${clave}-titulo`, texto: a.titulo, tipo: "seccion" },
    ...a.renglones.map((r) => ({
      id: `${clave}-${r.id}`,
      texto: r.concepto,
      valores: [r.monto],
      tipo: "renglon" as const,
    })),
    { id: `${clave}-total`, texto: total, valores: [a.total], tipo: "total" as const },
  ];
}

/** El flujo de efectivo como documento exportable: una columna de montos por actividad. */
export function documentoFlujoEfectivo(estado: EstadoFlujoEfectivo): DocumentoEstado {
  const F = T.flujo;
  const N = NOMBRES_ESTADOS[estado.formato].flujo;
  return {
    titulo: estado.titulo,
    periodo: F.periodo(formatearFecha(estado.desde), formatearFecha(estado.hasta)),
    columnas: [{ titulo: F.columnaMonto, tipo: "dinero" }],
    filas: [
      ...filasDeActividad("operacion", estado.operacion, F.totalOperacion),
      ...filasDeActividad("inversion", estado.inversion, F.totalInversion),
      ...filasDeActividad("financiamiento", estado.financiamiento, F.totalFinanciamiento),
      { id: "variacion", texto: N.variacionNeta, valores: [estado.variacionNeta], tipo: "resultado" },
      { id: "inicial", texto: N.efectivoInicial, valores: [estado.efectivoInicial], tipo: "renglon" },
      { id: "final", texto: N.efectivoFinal, valores: [estado.efectivoFinal], tipo: "resultado" },
    ],
    nombreHoja: estado.titulo.slice(0, 31),
    nombreArchivo: `${F.nombreArchivo}-${estado.desde}-${estado.hasta}`,
  };
}
