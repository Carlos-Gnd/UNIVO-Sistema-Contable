import { z } from "zod";
import { fechaSchema, idSchema } from "./comunes";
import { tipoPartidaSchema, type Naturaleza, type TipoCuenta, type TipoPartida } from "./enums";

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
  /** true si el saldo final está en el lado opuesto a la naturaleza contable de la cuenta. */
  saldoContrario: boolean;
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

/** Una fila de la hoja de trabajo con las diez columnas contables. */
export interface LineaHojaTrabajo {
  /** null en la línea calculada de utilidad o pérdida del ejercicio. */
  cuentaId: string | null;
  codigo: string;
  nombre: string;
  tipoCuenta: TipoCuenta | null;
  resultado: "utilidad" | "perdida" | null;
  balanzaDebe: string;
  balanzaHaber: string;
  ajustesDebe: string;
  ajustesHaber: string;
  balanzaAjustadaDebe: string;
  balanzaAjustadaHaber: string;
  estadoResultadosDebe: string;
  estadoResultadosHaber: string;
  balanceGeneralDebe: string;
  balanceGeneralHaber: string;
}

export type TotalesHojaTrabajo = Omit<
  LineaHojaTrabajo,
  "cuentaId" | "codigo" | "nombre" | "tipoCuenta" | "resultado"
>;

/** Hoja de trabajo de diez columnas (HU-31): balanza, ajustes, balanza ajustada, resultados y balance general. */
export interface HojaTrabajo {
  desde: string;
  hasta: string;
  /** null si es consolidada */
  sucursalId: string | null;
  lineas: LineaHojaTrabajo[];
  totales: TotalesHojaTrabajo;
  resultado: { tipo: "utilidad" | "perdida" | null; monto: string };
  diferencias: {
    balanza: string;
    ajustes: string;
    balanzaAjustada: string;
    estadoResultados: string;
    balanceGeneral: string;
  };
  cuadra: boolean;
}

/** Hoja de trabajo: usa los mismos filtros de período y sucursal que la balanza de comprobación. */
export const consultaHojaTrabajoSchema = consultaBalanzaSchema;
export type ConsultaHojaTrabajo = ConsultaBalanza;

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

/** Estado de cambios en el patrimonio de un período (HU-40): los mismos filtros que el estado de resultados. */
export const consultaCambiosPatrimonioSchema = consultaBalanzaSchema;
export type ConsultaCambiosPatrimonio = ConsultaBalanza;

/** Columna del estado de cambios en el patrimonio; cuáles hay depende del tipo de contribuyente. */
export type IdColumnaPatrimonio = "capital" | "reservas" | "utilidades" | "retiros";

export interface ColumnaPatrimonio {
  id: IdColumnaPatrimonio;
  titulo: string;
}

export type IdRenglonPatrimonio =
  "saldo-inicial" | "aportes" | "reservas" | "resultado" | "retiros" | "otros" | "saldo-final";

export interface RenglonPatrimonio {
  id: IdRenglonPatrimonio;
  concepto: string;
  /** Un monto por columna, en el orden de `columnas`; los acreedores suman y los retiros restan */
  valores: string[];
  /** Suma de los valores del renglón */
  total: string;
}

/**
 * Estado de cambios en el patrimonio (HU-40): saldo inicial, aportes, reservas, resultado del período,
 * retiros o dividendos y saldo final. Las columnas dependen del tipo de contribuyente: capital, utilidades y
 * retiros del titular para una persona natural; capital social, reservas y utilidades para una sociedad. El
 * total del saldo final coincide con el patrimonio del balance general a la misma fecha.
 */
export interface EstadoCambiosPatrimonio {
  desde: string;
  hasta: string;
  /** null si es consolidado */
  sucursalId: string | null;
  tipoContribuyente: "persona_natural" | "sociedad";
  columnas: ColumnaPatrimonio[];
  renglones: RenglonPatrimonio[];
  /** Patrimonio al final del período: el total del renglón saldo final */
  patrimonioFinal: string;
}

// ── Libro diario (HU-25) ────────────────────────────────────────────────────────────────────────────────

/** Renglones por página del libro diario impreso: los folios y los totales Vienen y Pasan dependen de él. */
export const RENGLONES_POR_PAGINA_DIARIO = { minimo: 10, maximo: 100, porDefecto: 40 } as const;

/**
 * Filtros del libro diario: el período (dentro de un mismo ejercicio), el tipo de partida y la sucursal;
 * y cómo se folia: renglones por página y número del primer folio (para continuar un libro ya impreso).
 */
export const consultaLibroDiarioSchema = z
  .object({
    desde: fechaSchema,
    hasta: fechaSchema,
    tipo: tipoPartidaSchema.optional(),
    /** Sin sucursal, el libro es consolidado (de las sucursales a las que el usuario tiene acceso) */
    sucursalId: idSchema.optional(),
    renglonesPorPagina: z.coerce
      .number({ error: "Renglones por página inválido." })
      .int()
      .min(RENGLONES_POR_PAGINA_DIARIO.minimo)
      .max(RENGLONES_POR_PAGINA_DIARIO.maximo)
      .default(RENGLONES_POR_PAGINA_DIARIO.porDefecto),
    folioInicial: z.coerce.number({ error: "Folio inválido." }).int().min(1).default(1),
  })
  .refine((c) => c.desde <= c.hasta, {
    error: "La fecha inicial no puede ser posterior a la final.",
    path: ["desde"],
  });
export type ConsultaLibroDiario = z.infer<typeof consultaLibroDiarioSchema>;
export type ConsultaLibroDiarioEntrada = z.input<typeof consultaLibroDiarioSchema>;

/**
 * Un renglón del libro diario en el formato de clase:
 * - "partida": encabezado con la fecha y el número de la partida;
 * - "cuenta": cuenta de mayor con el total de sus subcuentas en Debe o en Haber;
 * - "subcuenta": subcuenta con su monto en la columna Parcial;
 * - "concepto": la explicación de la partida ("V/ …").
 */
export interface RenglonDiario {
  tipo: "partida" | "cuenta" | "subcuenta" | "concepto";
  partidaId: string;
  /** AAAA-MM-DD; solo en el encabezado */
  fecha: string | null;
  codigo: string | null;
  descripcion: string;
  parcial: string | null;
  debe: string | null;
  haber: string | null;
}

export interface TotalesDiario {
  debe: string;
  haber: string;
}

/** Una página (folio) del libro: lo que viene de la anterior, sus renglones y lo que pasa a la siguiente. */
export interface PaginaDiario {
  folio: number;
  vienen: TotalesDiario;
  renglones: RenglonDiario[];
  pasan: TotalesDiario;
}

export interface LibroDiario {
  desde: string;
  hasta: string;
  /** null si es consolidado */
  sucursalId: string | null;
  /** null si incluye todos los tipos */
  tipo: TipoPartida | null;
  renglonesPorPagina: number;
  /** Partidas contabilizadas y anuladas del período (la anulada y su reversión aparecen las dos) */
  partidas: number;
  paginas: PaginaDiario[];
  totales: TotalesDiario;
  cuadra: boolean;
}
