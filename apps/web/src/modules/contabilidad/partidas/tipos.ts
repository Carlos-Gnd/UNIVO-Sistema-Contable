import type { EstadoPartida, Naturaleza, TipoCuenta, TipoPartida } from "@contable/shared";

/**
 * Partida como la devuelve la API de borradores (S1-T78, rama feat/HU-20-api-partidas-borrador).
 * Es la misma forma que PartidaVista de @contable/shared en esa rama: al fusionarla, importar de ahí.
 */
export interface LineaPartidaVista {
  cuentaId: string;
  codigo: string;
  nombre: string;
  debe: string;
  haber: string;
  concepto: string | null;
}

export interface PartidaVista {
  id: string;
  sucursalId: string;
  /** AAAA-MM-DD */
  fecha: string;
  tipo: TipoPartida;
  estado: EstadoPartida;
  numero: number | null;
  concepto: string | null;
  documentoTipo: string | null;
  documentoNumero: string | null;
  origen: string;
  lineas: LineaPartidaVista[];
  totalDebe: string;
  totalHaber: string;
  diferencia: string;
  cuadra: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

/** Cuenta del catálogo como la devuelve GET /empresas/:empresaId/cuentas (S1-T62). */
export interface CuentaCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  naturaleza: Naturaleza;
  tipo: TipoCuenta;
  cuentaPadreId: string | null;
  activa: boolean;
  /** Si la API no lo envía, se deduce: es de último nivel cuando ninguna cuenta la tiene como padre */
  imputable?: boolean;
}

/** Cuenta con imputable ya resuelto, lista para buscar y validar. */
export type CuentaParaPartida = CuentaCatalogo & { imputable: boolean };

export const ETIQUETA_TIPO_PARTIDA: Record<TipoPartida, string> = {
  apertura: "Apertura",
  operacion: "Operación",
  ajuste: "Ajuste",
  cierre: "Cierre",
  reapertura: "Reapertura",
  reversion: "Reversión",
};
