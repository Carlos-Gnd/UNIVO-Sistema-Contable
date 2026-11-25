import { Inject, Injectable } from "@nestjs/common";
import type {
  CambiarEstadoCheque,
  CrearMovimientoBancario,
  FiltroMovimientosBancarios,
  MovimientoBancarioVista,
} from "@contable/shared";
import {
  CuentaBancariaMovimientoNoEncontradaError,
  MovimientoBancarioEmpresaNoEncontradaError,
  REPOSITORIO_MOVIMIENTO_BANCARIO,
  SucursalMovimientoBancarioNoAutorizadaError,
  SucursalMovimientoBancarioNoEncontradaError,
  type AccesoMovimientoBancario,
  type RepositorioMovimientoBancario,
  type UnidadMovimientoBancario,
} from "../domain/movimiento-bancario.js";

async function accesoDe(
  unidad: UnidadMovimientoBancario,
  usuarioId: string,
  empresaId: string,
): Promise<AccesoMovimientoBancario> {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new MovimientoBancarioEmpresaNoEncontradaError();
  return acceso;
}

async function exigirSucursal(
  unidad: UnidadMovimientoBancario,
  empresaId: string,
  sucursalId: string,
  acceso: AccesoMovimientoBancario,
) {
  if (!acceso.todasSucursales && !acceso.sucursales.includes(sucursalId)) {
    throw new SucursalMovimientoBancarioNoAutorizadaError();
  }
  if (!(await unidad.existeSucursal(empresaId, sucursalId))) {
    throw new SucursalMovimientoBancarioNoEncontradaError();
  }
}

@Injectable()
export class CasosMovimientosBancarios {
  constructor(
    @Inject(REPOSITORIO_MOVIMIENTO_BANCARIO) private readonly repositorio: RepositorioMovimientoBancario,
  ) {}

  listar(
    usuarioId: string,
    empresaId: string,
    filtro: FiltroMovimientosBancarios,
  ): Promise<MovimientoBancarioVista[]> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await accesoDe(unidad, usuarioId, empresaId);
      const cuenta = await unidad.cuenta(empresaId, filtro.cuentaTesoreriaId);
      if (!cuenta.activa || cuenta.tipo !== "banco") throw new CuentaBancariaMovimientoNoEncontradaError();
      if (cuenta.sucursalId) await exigirSucursal(unidad, empresaId, cuenta.sucursalId, acceso);
      else if (!acceso.todasSucursales) throw new SucursalMovimientoBancarioNoAutorizadaError();
      return unidad.listar(empresaId, filtro, acceso);
    });
  }

  crear(
    usuarioId: string,
    empresaId: string,
    datos: CrearMovimientoBancario,
  ): Promise<MovimientoBancarioVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await accesoDe(unidad, usuarioId, empresaId);
      await exigirSucursal(unidad, empresaId, datos.sucursalId, acceso);
      const cuenta = await unidad.cuenta(empresaId, datos.cuentaTesoreriaId);
      if (!cuenta.activa || cuenta.tipo !== "banco") throw new CuentaBancariaMovimientoNoEncontradaError();
      if (cuenta.sucursalId && cuenta.sucursalId !== datos.sucursalId) {
        throw new CuentaBancariaMovimientoNoEncontradaError();
      }
      if (!cuenta.sucursalId && !acceso.todasSucursales) {
        throw new SucursalMovimientoBancarioNoAutorizadaError();
      }
      return unidad.crear(usuarioId, empresaId, datos, acceso);
    });
  }

  cambiarEstado(
    usuarioId: string,
    empresaId: string,
    id: string,
    datos: CambiarEstadoCheque,
  ): Promise<MovimientoBancarioVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await accesoDe(unidad, usuarioId, empresaId);
      const sucursalId = await unidad.sucursalDeMovimiento(empresaId, id);
      await exigirSucursal(unidad, empresaId, sucursalId, acceso);
      return unidad.cambiarEstado(usuarioId, empresaId, id, datos);
    });
  }
}
