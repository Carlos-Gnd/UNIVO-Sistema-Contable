import { z } from "zod";
import { fechaSchema, idSchema } from "./comunes";
import type { Naturaleza, TipoCuenta } from "./enums";

/**
 * Las tres balanzas de comprobación (HU-30): antes de ajustes, ajustada y posterior al cierre.
 * Cada una incluye distintos tipos de partida del ejercicio (ver TIPOS_DE_PARTIDA_EN_BALANZA).
 */
export const TIPOS_BALANZA = ["antes-ajustes", "ajustada", "posterior-cierre"] as const;
export const tipoBalanzaSchema = z.enum(TIPOS_BALANZA, { error: "Tipo de balanza inválido." });
export type TipoBalanza = z.infer<typeof tipoBalanzaSchema>;

export const NOMBRE_TIPO_BALANZA: Record<TipoBalanza, string> = {
  "antes-ajustes": "Balanza de comprobación antes de ajustes",
  ajustada: "Balanza de comprobación ajustada",
  "posterior-cierre": "Balanza de comprobación posterior al cierre",
};

/**
 * Tipos de partida del ejercicio que entran en cada balanza: las de operación, apertura, reapertura y
 * reversión siempre; los ajustes desde la ajustada; y el cierre solo en la posterior al cierre.
 */
export const TIPOS_DE_PARTIDA_EN_BALANZA: Record<TipoBalanza, readonly string[]> = {
  "antes-ajustes": ["apertura", "operacion", "reapertura", "reversion"],
  ajustada: ["apertura", "operacion", "reapertura", "reversion", "ajuste"],
  "posterior-cierre": ["apertura", "operacion", "reapertura", "reversion", "ajuste", "cierre"],
};

/** Filtros de la consulta: el período (dentro de un mismo ejercicio) y, opcionalmente, una sucursal. */
export const consultaBalanzaSchema = z
  .object({
    desde: fechaSchema,
    hasta: fechaSchema,
    /** Sin sucursal, la balanza es consolidada (de las sucursales a las que el usuario tiene acceso) */
    sucursalId: idSchema.optional(),
  })
  .refine((c) => c.desde <= c.hasta, {
    error: "La fecha inicial no puede ser posterior a la final.",
    path: ["desde"],
  });
export type ConsultaBalanza = z.infer<typeof consultaBalanzaSchema>;

/** Una cuenta de último nivel con movimiento: saldo inicial, movimientos del período y saldo final. */
export interface LineaBalanza {
  cuentaId: string;
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  tipo: TipoCuenta;
  saldoInicialDebe: string;
  saldoInicialHaber: string;
  movimientoDebe: string;
  movimientoHaber: string;
  saldoFinalDebe: string;
  saldoFinalHaber: string;
}

/** Totales de cada columna de la balanza. */
export interface TotalesBalanza {
  saldoInicialDebe: string;
  saldoInicialHaber: string;
  movimientoDebe: string;
  movimientoHaber: string;
  saldoFinalDebe: string;
  saldoFinalHaber: string;
}

export interface Balanza {
  tipo: TipoBalanza;
  titulo: string;
  desde: string;
  hasta: string;
  /** null si es consolidada */
  sucursalId: string | null;
  lineas: LineaBalanza[];
  totales: TotalesBalanza;
  /** Diferencia (siempre positiva) entre el debe y el haber de cada sección; "0.00" si cuadra */
  diferencias: { saldoInicial: string; movimientos: string; saldoFinal: string };
  /** true si el debe y el haber son iguales en las tres secciones */
  cuadra: boolean;
}

/** Estado de resultados de un período (HU-37): los mismos filtros que la balanza. */
export const consultaEstadoResultadosSchema = consultaBalanzaSchema;
export type ConsultaEstadoResultados = ConsultaBalanza;

/** Balance general a una fecha (HU-38) y, opcionalmente, de una sucursal. */
export const consultaBalanceGeneralSchema = z.object({
  fecha: fechaSchema,
  /** Sin sucursal, el balance es consolidado (de las sucursales a las que el usuario tiene acceso) */
  sucursalId: idSchema.optional(),
});
export type ConsultaBalanceGeneral = z.infer<typeof consultaBalanceGeneralSchema>;

/**
 * Un renglón de un estado financiero: una cuenta de mayor (4 dígitos) con la suma de sus subcuentas. El
 * monto va con el signo de la sección: una cuenta complementaria, como la depreciación acumulada dentro del
 * activo o las devoluciones dentro de las ventas, resta y sale negativa. "codigo" vacío marca un renglón
 * calculado (la utilidad del ejercicio en curso en el balance).
 */
export interface RenglonEstado {
  codigo: string;
  nombre: string;
  monto: string;
}

export interface SeccionEstado {
  titulo: string;
  renglones: RenglonEstado[];
  total: string;
}

/**
 * Estado de resultados (HU-37) con los movimientos del período de la balanza ajustada (sin las partidas de
 * cierre). Las utilidades negativas son pérdidas.
 */
export interface EstadoResultados {
  desde: string;
  hasta: string;
  /** null si es consolidado */
  sucursalId: string | null;
  ventas: SeccionEstado;
  costoVentas: SeccionEstado;
  utilidadBruta: string;
  gastosOperacion: SeccionEstado;
  utilidadOperacion: string;
  otrosIngresos: SeccionEstado;
  otrosGastos: SeccionEstado;
  utilidadAntesImpuesto: string;
  impuestoRenta: SeccionEstado;
  utilidadNeta: string;
}

/** Balance general a una fecha (HU-38). */
export interface BalanceGeneral {
  fecha: string;
  /** null si es consolidado */
  sucursalId: string | null;
  activoCorriente: SeccionEstado;
  activoNoCorriente: SeccionEstado;
  totalActivo: string;
  pasivoCorriente: SeccionEstado;
  pasivoNoCorriente: SeccionEstado;
  totalPasivo: string;
  patrimonio: SeccionEstado;
  totalPasivoPatrimonio: string;
  /** Activo menos pasivo y patrimonio; "0.00" si cuadra */
  diferencia: string;
  cuadra: boolean;
}
