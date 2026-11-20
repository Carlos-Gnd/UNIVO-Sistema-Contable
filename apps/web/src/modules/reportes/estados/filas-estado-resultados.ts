import { Dinero, type EstadoResultados, type SeccionEstado } from "@contable/shared";
import { TEXTOS_ESTADO_RESULTADOS as T } from "./textos";

/** Una fila del estado: encabezado de sección, renglón de cuenta, total de sección o resultado. */
export interface FilaEstado {
  id: string;
  texto: string;
  /** Sin monto en los encabezados de sección */
  monto?: string;
  tipo: "seccion" | "renglon" | "total" | "resultado";
}

function seccion(id: string, titulo: string, s: SeccionEstado, siempre: boolean): FilaEstado[] {
  if (!siempre && s.renglones.length === 0) return [];
  return [
    { id: `${id}-t`, texto: titulo, tipo: "seccion" },
    ...s.renglones.map((r) => ({
      id: `${id}-${r.codigo}`,
      texto: `${r.codigo} · ${r.nombre}`,
      monto: r.monto,
      tipo: "renglon" as const,
    })),
  ];
}

/** Aplana el estado de resultados en el orden del formato: ventas hasta utilidad neta. */
export function filasEstadoResultados(e: EstadoResultados): FilaEstado[] {
  const resultado = (id: string, texto: string, monto: string): FilaEstado => ({
    id,
    texto,
    monto,
    tipo: "resultado",
  });
  return [
    ...seccion("ventas", T.ventas, e.ventas, true),
    ...seccion("costo", T.costoVentas, e.costoVentas, true),
    resultado("bruta", T.utilidadBruta, e.utilidadBruta),
    ...seccion("gastos", T.gastosOperacion, e.gastosOperacion, true),
    resultado("operacion", T.utilidadOperacion, e.utilidadOperacion),
    ...seccion("otros-ingresos", T.otrosIngresos, e.otrosIngresos, false),
    ...seccion("otros-gastos", T.otrosGastos, e.otrosGastos, false),
    resultado("antes", T.utilidadAntesImpuesto, e.utilidadAntesImpuesto),
    ...seccion("isr", T.impuestoRenta, e.impuestoRenta, false),
    resultado(
      "neta",
      Dinero.de(e.utilidadNeta).esNegativo() ? T.perdidaNeta : T.utilidadNeta,
      e.utilidadNeta,
    ),
  ];
}
