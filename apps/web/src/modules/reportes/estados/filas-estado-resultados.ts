import { Dinero, NOMBRES_ESTADOS, type EstadoResultados, type SeccionEstado } from "@contable/shared";
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
    // El rótulo «(−)» marca la resta en el encabezado, no en el total
    { id: `${id}-total`, texto: T.total(titulo.replace(/^\(−\)\s*/, "")), monto: s.total, tipo: "total" },
  ];
}

/** Aplana el estado de resultados en el orden del formato: ventas hasta utilidad neta. */
export function filasEstadoResultados(e: EstadoResultados): FilaEstado[] {
  const N = NOMBRES_ESTADOS[e.formato].resultados;
  const resultado = (id: string, texto: string, monto: string): FilaEstado => ({
    id,
    texto,
    monto,
    tipo: "resultado",
  });
  return [
    ...seccion("ventas", N.ventas, e.ventas, true),
    ...seccion("costo", N.costoVentas, e.costoVentas, true),
    resultado("bruta", N.utilidadBruta, e.utilidadBruta),
    ...seccion("gastos", N.gastosOperacion, e.gastosOperacion, true),
    resultado("operacion", N.utilidadOperacion, e.utilidadOperacion),
    ...seccion("otros-ingresos", N.otrosIngresos, e.otrosIngresos, false),
    ...seccion("otros-gastos", N.otrosGastos, e.otrosGastos, false),
    resultado("antes", N.utilidadAntesImpuesto, e.utilidadAntesImpuesto),
    ...seccion("isr", N.impuestoRenta, e.impuestoRenta, false),
    resultado(
      "neta",
      Dinero.de(e.utilidadNeta).esNegativo() ? N.perdidaNeta : N.utilidadNeta,
      e.utilidadNeta,
    ),
  ];
}
