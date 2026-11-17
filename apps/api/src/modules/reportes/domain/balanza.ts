import {
  Dinero,
  NOMBRE_TIPO_BALANZA,
  type Balanza,
  type LineaBalanza,
  type Naturaleza,
  type TipoBalanza,
  type TipoCuenta,
  type TotalesBalanza,
} from "@contable/shared";

export const PERMISO_VER_REPORTES = "reportes.ver";

/** Permisos y sucursales del usuario en la empresa. */
export interface AccesoReportes {
  permisos: ReadonlySet<string>;
  todasSucursales: boolean;
  sucursales: readonly string[];
}

/** Saldos de una cuenta de último nivel tal como salen de la base, antes de separarlos en debe y haber. */
export interface FilaSaldos {
  cuentaId: string;
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  tipo: TipoCuenta;
  /** Saldo inicial neto (debe menos haber): positivo es deudor y negativo acreedor */
  saldoInicial: string;
  movimientoDebe: string;
  movimientoHaber: string;
}

/** Ejercicio que contiene el período consultado. */
export interface RangoEjercicio {
  inicio: string;
  fin: string;
}

/** Lo que se pide a la base: el período, el ejercicio, los tipos de partida y las sucursales. */
export interface ConsultaSaldos {
  empresaId: string;
  tipo: TipoBalanza;
  desde: string;
  hasta: string;
  inicioEjercicio: string;
  /** null = todas las sucursales de la empresa */
  sucursales: readonly string[] | null;
}

/** La empresa no existe o el usuario no pertenece a ella (no se revela cuál de las dos). */
export class EmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

export class SinPermisoReportesError extends Error {
  constructor() {
    super("Su rol no permite consultar reportes en esta empresa.");
  }
}

export class SucursalNoAutorizadaError extends Error {
  constructor() {
    super("No tiene acceso a la sucursal indicada.");
  }
}

/** El período consultado debe estar dentro de un ejercicio existente y no cruzar a otro. */
export class PeriodoFueraDeEjercicioError extends Error {}

/** Separa un saldo neto (debe menos haber) en su columna de deudor o de acreedor. */
export function separarSaldo(neto: Dinero): { debe: Dinero; haber: Dinero } {
  return neto.esNegativo()
    ? { debe: Dinero.cero(), haber: neto.abs() }
    : { debe: neto, haber: Dinero.cero() };
}

function sumar(lineas: readonly LineaBalanza[], columna: keyof TotalesBalanza): string {
  return Dinero.sumar(lineas.map((l) => l[columna])).aTexto();
}

/** Diferencia, siempre positiva, entre el debe y el haber de una sección. */
const diferencia = (debe: string, haber: string) => Dinero.de(debe).menos(haber).abs().aTexto();

/**
 * Arma la balanza de comprobación a partir de los saldos por cuenta. Todo con Dinero (decimal.js): el saldo
 * final es el inicial más los movimientos del período, y las cuentas sin saldo ni movimiento no aparecen.
 */
export function armarBalanza(
  tipo: TipoBalanza,
  periodo: { desde: string; hasta: string; sucursalId: string | null },
  filas: readonly FilaSaldos[],
): Balanza {
  const lineas: LineaBalanza[] = [];
  for (const f of filas) {
    const inicial = Dinero.de(f.saldoInicial);
    const final = inicial.mas(f.movimientoDebe).menos(f.movimientoHaber);
    if (
      inicial.esCero() &&
      final.esCero() &&
      Dinero.de(f.movimientoDebe).esCero() &&
      Dinero.de(f.movimientoHaber).esCero()
    ) {
      continue;
    }
    const saldoInicial = separarSaldo(inicial);
    const saldoFinal = separarSaldo(final);
    lineas.push({
      cuentaId: f.cuentaId,
      codigo: f.codigo,
      nombre: f.nombre,
      naturaleza: f.naturaleza,
      tipo: f.tipo,
      saldoInicialDebe: saldoInicial.debe.aTexto(),
      saldoInicialHaber: saldoInicial.haber.aTexto(),
      movimientoDebe: Dinero.de(f.movimientoDebe).aTexto(),
      movimientoHaber: Dinero.de(f.movimientoHaber).aTexto(),
      saldoFinalDebe: saldoFinal.debe.aTexto(),
      saldoFinalHaber: saldoFinal.haber.aTexto(),
    });
  }
  // Los códigos son jerárquicos: se ordenan como texto (1101 va antes que 12 y que 5101), no como números
  lineas.sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));

  const totales: TotalesBalanza = {
    saldoInicialDebe: sumar(lineas, "saldoInicialDebe"),
    saldoInicialHaber: sumar(lineas, "saldoInicialHaber"),
    movimientoDebe: sumar(lineas, "movimientoDebe"),
    movimientoHaber: sumar(lineas, "movimientoHaber"),
    saldoFinalDebe: sumar(lineas, "saldoFinalDebe"),
    saldoFinalHaber: sumar(lineas, "saldoFinalHaber"),
  };
  const diferencias = {
    saldoInicial: diferencia(totales.saldoInicialDebe, totales.saldoInicialHaber),
    movimientos: diferencia(totales.movimientoDebe, totales.movimientoHaber),
    saldoFinal: diferencia(totales.saldoFinalDebe, totales.saldoFinalHaber),
  };
  return {
    tipo,
    titulo: NOMBRE_TIPO_BALANZA[tipo],
    desde: periodo.desde,
    hasta: periodo.hasta,
    sucursalId: periodo.sucursalId,
    lineas,
    totales,
    diferencias,
    cuadra: Object.values(diferencias).every((d) => Dinero.de(d).esCero()),
  };
}
