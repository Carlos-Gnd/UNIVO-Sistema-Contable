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
