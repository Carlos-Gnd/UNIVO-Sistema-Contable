import { z } from "zod";
import type { FilaCuadro } from "../contabilidad/depreciacion";
import type { ActivoFijoVista, PartidaGenerada } from "./activo-fijo";

/** Mes a depreciar, AAAA-MM. */
export const mesDepreciacionSchema = z
  .string({ error: "Indique el mes (AAAA-MM)." })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "El mes debe tener el formato AAAA-MM." });

export const consultaDepreciacionSchema = z.object({ mes: mesDepreciacionSchema });
export type ConsultaDepreciacion = z.infer<typeof consultaDepreciacionSchema>;

/** Generar la depreciación de un mes (HU-82): crea y contabiliza una partida de ajuste por sucursal. */
export const generarDepreciacionSchema = z.object({ mes: mesDepreciacionSchema });
export type GenerarDepreciacion = z.infer<typeof generarDepreciacionSchema>;

/**
 * Situación de un activo en el mes consultado:
 * pendiente (se puede depreciar), generada (ya tiene su partida), bloqueada (faltan meses anteriores) o
 * terminada (ya se depreció por completo).
 */
export type EstadoDepreciacionMes = "pendiente" | "generada" | "bloqueada" | "terminada";

export interface FilaDepreciacionMes {
  activoId: string;
  codigo: string;
  nombre: string;
  sucursalId: string;
  costo: string;
  tasaAnual: string;
  /** Cuota del mes; "0.00" si el activo ya terminó de depreciarse */
  cuota: string;
  /** Depreciación acumulada al cerrar el mes */
  acumulada: string;
  valorEnLibros: string;
  estado: EstadoDepreciacionMes;
  /** Primer día del mes que falta depreciar antes, si está bloqueada */
  mesPendiente: string | null;
}

export interface LineaPartidaPrevista {
  cuentaId: string;
  codigo: string;
  nombre: string;
  debe: string;
  haber: string;
}

/** Partida que se generará para una sucursal con las cuotas pendientes del mes. */
export interface PartidaPrevista {
  sucursalId: string;
  sucursalNombre: string;
  fecha: string;
  concepto: string;
  lineas: LineaPartidaPrevista[];
  total: string;
}

export interface VistaDepreciacionMes {
  /** AAAA-MM */
  mes: string;
  activos: FilaDepreciacionMes[];
  partidas: PartidaPrevista[];
  /** Suma de las cuotas pendientes */
  totalPendiente: string;
}

export interface ResultadoDepreciacion {
  mes: string;
  partidas: { sucursalId: string; partida: PartidaGenerada; total: string }[];
  total: string;
}

export interface FilaCuadroActivo extends FilaCuadro {
  /** generada si ya tiene su partida; pendiente si aún no */
  estado: "generada" | "pendiente";
  partidaId: string | null;
}

export interface CuadroActivo {
  activo: ActivoFijoVista;
  filas: FilaCuadroActivo[];
}
