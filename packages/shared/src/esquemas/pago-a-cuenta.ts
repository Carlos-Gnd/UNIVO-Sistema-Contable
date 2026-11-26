import { z } from "zod";

/** Mes del F-14 que se consulta o se genera. */
export const periodoPagoACuentaSchema = z
  .object({
    anio: z.coerce.number().int().min(2000).max(2100),
    mes: z.coerce.number().int().min(1).max(12),
  })
  .strict();
export type PeriodoPagoACuenta = z.infer<typeof periodoPagoACuentaSchema>;

export const anioPagoACuentaSchema = z.object({ anio: z.coerce.number().int().min(2000).max(2100) }).strict();

export interface LineaPartidaPagoACuenta {
  codigo: string;
  nombre: string;
  debe: string;
  haber: string;
}

export type EstadoPartidaPagoACuenta = "borrador" | "contabilizada" | "anulada";

/** Lo que quedó guardado al generar la partida de determinación del mes. */
export interface DeclaracionPagoACuentaVista {
  id: string;
  partidaId: string;
  estadoPartida: EstadoPartidaPagoACuenta;
  numeroPartida: number | null;
  tasa: string;
  ingresosBrutos: string;
  pagoACuenta: string;
  retencionesPlanilla: string;
  retencionesServicios: string;
  presentadaEn: string | null;
  /** Las cifras del mes cambiaron después de generar la partida (se registraron o anularon partidas). */
  desactualizada: boolean;
}

/** F-14 de un mes: cálculo actual desde la contabilidad y, si ya se generó, la declaración guardada. */
export interface PagoACuentaVista {
  anio: number;
  mes: number;
  /** Último día del mes, fecha de la partida de determinación. */
  fechaPartida: string;
  tasa: string;
  ingresosBrutos: string;
  pagoACuenta: string;
  retencionesPlanilla: string;
  retencionesServicios: string;
  totalRetenciones: string;
  totalAEnterar: string;
  /** Partida que se generaría con las cifras actuales (vista previa). */
  lineasPartida: LineaPartidaPagoACuenta[];
  declaracion: DeclaracionPagoACuentaVista | null;
  /** Estado del período contable del mes: la partida solo se genera en un período abierto. */
  periodoAbierto: boolean;
}

export interface PagoACuentaMesVista {
  mes: number;
  pagoACuenta: string;
  estadoPartida: EstadoPartidaPagoACuenta | null;
  presentada: boolean;
}

/**
 * Pagos a cuenta del ejercicio, para el cierre anual (HU-34). `totalContabilizado` es lo que el ISR anual puede
 * acreditar: suma de las partidas de determinación contabilizadas, que es también el movimiento de la cuenta 111104.
 */
export interface PagosACuentaEjercicioVista {
  anio: number;
  meses: PagoACuentaMesVista[];
  totalContabilizado: string;
  totalEnBorrador: string;
}
