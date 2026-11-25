import {
  Dinero,
  type ActivoFijoVista,
  type CategoriaActivo,
  type CrearActivoFijo,
  type LineaPartida,
  type PartidaGenerada,
} from "@contable/shared";

export const PERMISO_VER_ACTIVOS = "activo_fijo.ver";
export const PERMISO_REGISTRAR_ACTIVOS = "activo_fijo.registrar";

/** Origen con el que las partidas del módulo quedan marcadas (partidas.origen). */
export const ORIGEN_ACTIVO_FIJO = "activo_fijo";

/** Cuentas del catálogo base que se usan cuando el activo no indica las suyas. */
export const CUENTAS_POR_CATEGORIA: Record<CategoriaActivo, { activo: string; depreciacion: string }> = {
  edificaciones: { activo: "120102", depreciacion: "120201" },
  instalaciones: { activo: "120103", depreciacion: "120202" },
  equipo_transporte: { activo: "120104", depreciacion: "120203" },
  mobiliario_equipo: { activo: "120105", depreciacion: "120204" },
};
/** Gasto por depreciación: la subcuenta 420122 del caso y, si no existe, la cuenta de Gastos de Administración. */
export const CUENTAS_GASTO_DEPRECIACION = ["420122", "4201"] as const;
/** Pérdida por baja de un activo de explotación. */
export const CUENTA_PERDIDA_BAJA = "4301";

/** Cuenta del catálogo con lo necesario para validar las líneas de una partida. */
export interface CuentaCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  /** Es de último nivel: no tiene subcuentas */
  imputable: boolean;
}

export class EmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}
export class SinPermisoActivoFijoError extends Error {
  constructor() {
    super("Su rol no permite esta operación sobre los activos fijos.");
  }
}
export class SucursalNoAutorizadaError extends Error {
  constructor() {
    super("La sucursal no existe en la empresa o no tiene acceso a ella.");
  }
}
export class ActivoNoEncontradoError extends Error {
  constructor() {
    super("El activo fijo no existe en esta empresa.");
  }
}
/** Una cuenta pedida no existe, está inactiva, no es de último nivel o no se encontró la predeterminada. */
export class CuentaInvalidaError extends Error {}
/** El activo ya está dado de baja. */
export class ActivoYaDadoDeBajaError extends Error {
  constructor(codigo: string) {
    super(`El activo ${codigo} ya está dado de baja.`);
  }
}
export class FechaBajaInvalidaError extends Error {}
/** Las líneas de la partida generada no pasan la validación (cuenta inactiva, descuadre…). */
export class PartidaInvalidaError extends Error {}
/** La base rechazó la partida o el activo (período cerrado, regla de un trigger…). */
export class ReglaContableError extends Error {}

export interface DatosNuevoActivo extends Omit<
  CrearActivoFijo,
  "cuentaActivoId" | "cuentaDepreciacionId" | "cuentaGastoId" | "contrapartidaId"
> {
  cuentaActivoId: string;
  cuentaDepreciacionId: string;
  cuentaGastoId: string;
}

export interface DatosPartida {
  sucursalId: string;
  fecha: string;
  concepto: string;
  origenId: string;
  /** Tipo de partida; por omisión, operación (la depreciación es un ajuste) */
  tipo?: "operacion" | "ajuste";
  lineas: LineaPartida[];
}

/** Partida de adquisición: el costo al debe de la cuenta del activo y al haber de la contrapartida (caja, bancos, proveedores). */
export function lineasDeAlta(costo: string, cuentaActivoId: string, contrapartidaId: string): LineaPartida[] {
  return [
    { cuentaId: cuentaActivoId, debe: costo, haber: "0" },
    { cuentaId: contrapartidaId, debe: "0", haber: costo },
  ];
}

/**
 * Partida de baja: se retira el costo del activo (haber), se cancela su depreciación acumulada (debe) y la
 * diferencia, el valor en libros, se registra como pérdida (debe).
 */
export function lineasDeBaja(
  activo: Pick<ActivoFijoVista, "costo" | "depreciacionAcumulada" | "cuentaActivo" | "cuentaDepreciacion">,
  cuentaPerdidaId: string,
): LineaPartida[] {
  const acumulada = Dinero.de(activo.depreciacionAcumulada);
  const perdida = Dinero.de(activo.costo).menos(acumulada);
  const lineas: LineaPartida[] = [];
  if (!acumulada.esCero()) {
    lineas.push({ cuentaId: activo.cuentaDepreciacion.id, debe: acumulada.aTexto(), haber: "0" });
  }
  if (!perdida.esCero()) lineas.push({ cuentaId: cuentaPerdidaId, debe: perdida.aTexto(), haber: "0" });
  lineas.push({ cuentaId: activo.cuentaActivo.id, debe: "0", haber: Dinero.de(activo.costo).aTexto() });
  return lineas;
}

export type { PartidaGenerada };
