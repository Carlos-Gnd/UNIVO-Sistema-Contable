import { z } from "zod";
import type { Naturaleza, TipoCuenta } from "./enums";

/**
 * Importación desde Excel (HU-17): plantillas descargables (S1-T68) y lectura con reporte de errores
 * por fila (S1-T69). Si el reporte tiene errores no se carga nada.
 */
export const tipoImportacionSchema = z.enum(["catalogo", "saldos-iniciales"], {
  error: "Tipo de importación inválido: use catalogo o saldos-iniciales.",
});
export type TipoImportacion = z.infer<typeof tipoImportacionSchema>;

/** Tamaño máximo del archivo que se sube para validar. */
export const MAXIMO_BYTES_IMPORTACION = 5 * 1024 * 1024;
/** Filas de datos que se leen como máximo de una hoja. */
export const MAXIMO_FILAS_IMPORTACION = 5000;

/** Un problema en el archivo. `fila` es el número de fila de Excel; null si es del archivo completo. */
export interface ProblemaImportacion {
  fila: number | null;
  columna: string | null;
  mensaje: string;
}

/** Cuenta leída de la plantilla del catálogo, ya normalizada. */
export interface FilaCatalogo {
  fila: number;
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  tipo: TipoCuenta;
}

/** Saldo inicial leído de la plantilla; exactamente uno de debe o haber es mayor que cero. */
export interface FilaSaldoInicial {
  fila: number;
  cuentaId: string;
  codigo: string;
  /** Texto con dos decimales, como los montos de la API */
  debe: string;
  haber: string;
}

export interface ResumenSaldos {
  totalDebe: string;
  totalHaber: string;
  diferencia: string;
  cuadra: boolean;
}

interface ReporteBase<T> {
  /** Sin errores: el archivo se puede cargar */
  valido: boolean;
  /** Filas con datos que se leyeron (las vacías no cuentan) */
  filasLeidas: number;
  errores: ProblemaImportacion[];
  /** Avisos que no impiden la carga, como un saldo contrario a la naturaleza de la cuenta */
  advertencias: ProblemaImportacion[];
  /** Filas listas para cargar; vacío si hay errores */
  filas: T[];
}

export interface ReporteCatalogo extends ReporteBase<FilaCatalogo> {
  tipo: "catalogo";
}

export interface ReporteSaldosIniciales extends ReporteBase<FilaSaldoInicial> {
  tipo: "saldos-iniciales";
  resumen: ResumenSaldos;
}

export type ReporteImportacion = ReporteCatalogo | ReporteSaldosIniciales;
