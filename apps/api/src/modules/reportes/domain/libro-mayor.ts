import {
  Dinero,
  type LibroMayor,
  type MovimientoLibroMayor,
  type Naturaleza,
  type TipoPartida,
} from "@contable/shared";

export const PERMISO_VER_REPORTES = "reportes.ver";

export interface AccesoLibroMayor {
  permisos: ReadonlySet<string>;
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export interface ConsultaMovimientosLibroMayor {
  empresaId: string;
  cuentaId: string;
  desde: string | null;
  hasta: string | null;
  tipo: TipoPartida | null;
  sucursales: readonly string[] | null;
}

export interface FilaLibroMayor extends MovimientoLibroMayor {
  saldoAnterior: string;
}

export interface DatosCuentaLibroMayor {
  cuentaId: string;
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  movimientos: FilaLibroMayor[];
}

export interface LibroMayorCuenta {
  cuentaId: string;
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  saldoInicial: string;
  movimientos: FilaLibroMayor[];
  totalDebe: string;
  totalHaber: string;
  saldoFinal: string;
}

export interface UnidadLibroMayor {
  acceso(usuarioId: string, empresaId: string): Promise<AccesoLibroMayor | null>;
  existeSucursal(empresaId: string, sucursalId: string): Promise<boolean>;
  cuenta(consulta: ConsultaMovimientosLibroMayor): Promise<DatosCuentaLibroMayor | null>;
}

export interface RepositorioLibroMayor {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadLibroMayor) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_LIBRO_MAYOR = Symbol("RepositorioLibroMayor");

export class EmpresaNoEncontradaLibroMayorError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

export class SinPermisoLibroMayorError extends Error {
  constructor() {
    super("Su rol no permite consultar reportes en esta empresa.");
  }
}

export class SucursalNoAutorizadaLibroMayorError extends Error {
  constructor() {
    super("No tiene acceso a la sucursal indicada.");
  }
}

export class CuentaLibroMayorNoEncontradaError extends Error {
  constructor() {
    super("La cuenta no existe en esta empresa.");
  }
}

export function armarLibroMayor(
  cuenta: DatosCuentaLibroMayor,
  filtros: { desde: string | null; hasta: string | null; tipo: TipoPartida | null },
): LibroMayor {
  const desde = filtros.desde;
  const hasta = filtros.hasta;
  const previos = desde === null ? [] : cuenta.movimientos.filter((m) => m.fecha < desde);
  const movimientosVisibles = cuenta.movimientos.filter(
    (m) =>
      (!filtros.desde || m.fecha >= filtros.desde) &&
      (!filtros.hasta || m.fecha <= filtros.hasta) &&
      (!filtros.tipo || m.tipo === filtros.tipo),
  );
  const movimientos = movimientosVisibles.map(
    ({ saldoAnterior: _saldoAnterior, ...movimiento }) => movimiento,
  );
  const saldoInicial = previos.at(-1)?.saldo ?? "0.00";
  const totalDebe = Dinero.sumar(movimientos.map((m) => m.debe)).aTexto();
  const totalHaber = Dinero.sumar(movimientos.map((m) => m.haber)).aTexto();
  const hastaFecha = hasta === null ? cuenta.movimientos : cuenta.movimientos.filter((m) => m.fecha <= hasta);
  const saldoFinal = hastaFecha.at(-1)?.saldo ?? saldoInicial;
  return {
    cuentaId: cuenta.cuentaId,
    codigo: cuenta.codigo,
    nombre: cuenta.nombre,
    naturaleza: cuenta.naturaleza,
    desde: filtros.desde,
    hasta: filtros.hasta,
    saldoInicial: Dinero.de(saldoInicial).aTexto(),
    movimientos,
    totalDebe,
    totalHaber,
    saldoFinal: Dinero.de(saldoFinal).aTexto(),
  };
}
