import type { FormatoEstados } from "./enums";

/** Nombres de los renglones del estado de resultados en cada formato. Los «(−)» y «(+)» marcan el signo. */
export interface NombresResultados {
  titulo: string;
  ventas: string;
  costoVentas: string;
  utilidadBruta: string;
  gastosOperacion: string;
  utilidadOperacion: string;
  otrosIngresos: string;
  otrosGastos: string;
  utilidadAntesImpuesto: string;
  impuestoRenta: string;
  utilidadNeta: string;
  perdidaNeta: string;
}

/** Nombres del balance general en cada formato. */
export interface NombresBalance {
  titulo: string;
  activo: string;
  activoCorriente: string;
  activoNoCorriente: string;
  totalActivo: string;
  pasivoPatrimonio: string;
  pasivoCorriente: string;
  pasivoNoCorriente: string;
  totalPasivo: string;
  patrimonio: string;
  totalPasivoPatrimonio: string;
}

/** Nombres propios del estado de cambios en el patrimonio en cada formato. */
export interface NombresPatrimonio {
  titulo: string;
  saldoInicial: string;
  resultado: string;
  saldoFinal: string;
}

/** Nombres propios del estado de flujo de efectivo en cada formato. */
export interface NombresFlujo {
  titulo: string;
  utilidadNeta: string;
  operacion: string;
  inversion: string;
  financiamiento: string;
  variacionNeta: string;
  efectivoInicial: string;
  efectivoFinal: string;
}

export interface NombresEstados {
  resultados: NombresResultados;
  balance: NombresBalance;
  patrimonio: NombresPatrimonio;
  flujo: NombresFlujo;
}

/**
 * Cómo se llama cada estado y cada renglón en el formato de clase y en el de NIIF para las PYMES (HU-42).
 * Solo cambian los nombres y los rótulos: las cifras son las mismas en los dos formatos.
 */
export const NOMBRES_ESTADOS: Record<FormatoEstados, NombresEstados> = {
  clase: {
    resultados: {
      titulo: "Estado de resultados",
      ventas: "Ventas",
      costoVentas: "(−) Costo de ventas",
      utilidadBruta: "Utilidad bruta",
      gastosOperacion: "(−) Gastos de operación",
      utilidadOperacion: "Utilidad de operación",
      otrosIngresos: "(+) Otros ingresos",
      otrosGastos: "(−) Otros gastos",
      utilidadAntesImpuesto: "Utilidad antes del impuesto",
      impuestoRenta: "(−) Impuesto sobre la renta",
      utilidadNeta: "Utilidad neta",
      perdidaNeta: "Pérdida neta",
    },
    balance: {
      titulo: "Balance general",
      activo: "Activo",
      activoCorriente: "Activo corriente",
      activoNoCorriente: "Activo no corriente",
      totalActivo: "Total activo",
      pasivoPatrimonio: "Pasivo y patrimonio",
      pasivoCorriente: "Pasivo corriente",
      pasivoNoCorriente: "Pasivo no corriente",
      totalPasivo: "Total pasivo",
      patrimonio: "Patrimonio",
      totalPasivoPatrimonio: "Total pasivo más patrimonio",
    },
    patrimonio: {
      titulo: "Estado de cambios en el patrimonio",
      saldoInicial: "Saldo inicial",
      resultado: "Resultado del período",
      saldoFinal: "Saldo final",
    },
    flujo: {
      titulo: "Estado de flujo de efectivo",
      utilidadNeta: "Utilidad neta del período",
      operacion: "Actividades de operación",
      inversion: "Actividades de inversión",
      financiamiento: "Actividades de financiamiento",
      variacionNeta: "Variación neta del efectivo",
      efectivoInicial: "Efectivo al inicio del período",
      efectivoFinal: "Efectivo al final del período",
    },
  },
  niif_pymes: {
    resultados: {
      titulo: "Estado del resultado integral",
      ventas: "Ingresos de actividades ordinarias",
      costoVentas: "(−) Costo de ventas",
      utilidadBruta: "Ganancia bruta",
      gastosOperacion: "(−) Gastos de administración y de venta",
      utilidadOperacion: "Resultado de las actividades de operación",
      otrosIngresos: "(+) Otros ingresos",
      otrosGastos: "(−) Otros gastos",
      utilidadAntesImpuesto: "Ganancia antes de impuestos",
      impuestoRenta: "(−) Gasto por impuesto a las ganancias",
      utilidadNeta: "Ganancia del período y resultado integral total",
      perdidaNeta: "Pérdida del período y resultado integral total",
    },
    balance: {
      titulo: "Estado de situación financiera",
      activo: "Activos",
      activoCorriente: "Activos corrientes",
      activoNoCorriente: "Activos no corrientes",
      totalActivo: "Total activos",
      pasivoPatrimonio: "Pasivos y patrimonio",
      pasivoCorriente: "Pasivos corrientes",
      pasivoNoCorriente: "Pasivos no corrientes",
      totalPasivo: "Total pasivos",
      patrimonio: "Patrimonio",
      totalPasivoPatrimonio: "Total pasivos y patrimonio",
    },
    patrimonio: {
      titulo: "Estado de cambios en el patrimonio",
      saldoInicial: "Saldo al inicio del período",
      resultado: "Resultado integral total del período",
      saldoFinal: "Saldo al final del período",
    },
    flujo: {
      titulo: "Estado de flujos de efectivo",
      utilidadNeta: "Ganancia del período",
      operacion: "Flujos de efectivo de actividades de operación",
      inversion: "Flujos de efectivo de actividades de inversión",
      financiamiento: "Flujos de efectivo de actividades de financiación",
      variacionNeta: "Aumento (disminución) neto de efectivo y equivalentes",
      efectivoInicial: "Efectivo y equivalentes al inicio del período",
      efectivoFinal: "Efectivo y equivalentes al final del período",
    },
  },
};

/** Rótulo del formato en los selectores. */
export const ETIQUETA_FORMATO: Record<FormatoEstados, string> = {
  clase: "Formato de clase",
  niif_pymes: "NIIF para las PYMES",
};

/** Quita el «(−) » o «(+) » con que el rótulo de un renglón marca su signo. */
export const sinSigno = (nombre: string) => nombre.replace(/^\([−+]\)\s*/, "");
