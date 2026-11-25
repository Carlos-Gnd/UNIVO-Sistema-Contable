import { Inject, Injectable } from "@nestjs/common";
import type {
  CajaChicaVista,
  CrearCajaChica,
  CrearValeCajaChica,
  ReintegrarCajaChica,
} from "@contable/shared";
import {
  CajaChicaEmpresaNoEncontradaError,
  REPOSITORIO_CAJA_CHICA,
  SucursalCajaChicaNoAutorizadaError,
  SucursalCajaChicaNoEncontradaError,
  type AccesoCajaChica,
  type RepositorioCajaChica,
  type UnidadCajaChica,
} from "../domain/caja-chica.js";

async function accesoDe(
  unidad: UnidadCajaChica,
  usuarioId: string,
  empresaId: string,
): Promise<AccesoCajaChica> {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new CajaChicaEmpresaNoEncontradaError();
  return acceso;
}

async function exigirSucursal(
  unidad: UnidadCajaChica,
  empresaId: string,
  sucursalId: string,
  acceso: AccesoCajaChica,
) {
  if (!acceso.todasSucursales && !acceso.sucursales.includes(sucursalId)) {
    throw new SucursalCajaChicaNoAutorizadaError();
  }
  if (!(await unidad.existeSucursal(empresaId, sucursalId))) {
    throw new SucursalCajaChicaNoEncontradaError();
  }
}

/** Operaciones de caja chica dentro del alcance de sucursales del usuario. */
@Injectable()
export class CasosCajaChica {
  constructor(@Inject(REPOSITORIO_CAJA_CHICA) private readonly repositorio: RepositorioCajaChica) {}

  listar(usuarioId: string, empresaId: string): Promise<CajaChicaVista[]> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await accesoDe(unidad, usuarioId, empresaId);
      return unidad.cajas(empresaId, acceso);
    });
  }

  abrir(usuarioId: string, empresaId: string, datos: CrearCajaChica): Promise<CajaChicaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await accesoDe(unidad, usuarioId, empresaId);
      await exigirSucursal(unidad, empresaId, datos.sucursalId, acceso);
      return unidad.abrir(usuarioId, empresaId, datos, acceso);
    });
  }

  registrarVale(
    usuarioId: string,
    empresaId: string,
    id: string,
    datos: CrearValeCajaChica,
  ): Promise<CajaChicaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await accesoDe(unidad, usuarioId, empresaId);
      const caja = await unidad.caja(empresaId, id);
      await exigirSucursal(unidad, empresaId, caja.sucursalId, acceso);
      return unidad.registrarVale(empresaId, id, datos);
    });
  }

  reintegrar(
    usuarioId: string,
    empresaId: string,
    id: string,
    datos: ReintegrarCajaChica,
  ): Promise<CajaChicaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await accesoDe(unidad, usuarioId, empresaId);
      const caja = await unidad.caja(empresaId, id);
      await exigirSucursal(unidad, empresaId, caja.sucursalId, acceso);
      return unidad.reintegrar(usuarioId, empresaId, id, datos, acceso);
    });
  }
}
