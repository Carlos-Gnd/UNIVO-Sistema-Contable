import { Inject, Injectable } from "@nestjs/common";
import type { CrearCuentaTesoreria, CuentaTesoreriaVista, EditarCuentaTesoreria } from "@contable/shared";
import {
  REPOSITORIO_TESORERIA,
  SucursalNoAutorizadaError,
  SucursalNoEncontradaError,
  type RepositorioTesoreria,
  type UnidadTesoreria,
} from "../domain/cuenta-tesoreria.js";

/** Quien no ve todas las sucursales solo administra cajas y bancos de las suyas (nunca los de toda la empresa). */
async function exigirAlcance(
  unidad: UnidadTesoreria,
  usuarioId: string,
  empresaId: string,
  sucursalId: string | null,
) {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new SucursalNoAutorizadaError();
  if (acceso.todasSucursales) {
    if (sucursalId && !(await unidad.existeSucursal(empresaId, sucursalId)))
      throw new SucursalNoEncontradaError();
    return acceso;
  }
  if (!sucursalId || !acceso.sucursales.includes(sucursalId)) throw new SucursalNoAutorizadaError();
  return acceso;
}

/**
 * Cajas y cuentas bancarias de la empresa (HU-76). El permiso (tesoreria.ver o tesoreria.registrar) lo exige el
 * controlador; aquí se aplica el alcance por sucursal y cada operación corre en una transacción a nombre del
 * usuario para que la bitácora registre quién la hizo.
 */
@Injectable()
export class CasosTesoreria {
  constructor(@Inject(REPOSITORIO_TESORERIA) private readonly repositorio: RepositorioTesoreria) {}

  listar(usuarioId: string, empresaId: string): Promise<CuentaTesoreriaVista[]> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const acceso = await u.acceso(usuarioId, empresaId);
      if (!acceso) throw new SucursalNoAutorizadaError();
      return u.cuentas(empresaId, acceso);
    });
  }

  crear(usuarioId: string, empresaId: string, datos: CrearCuentaTesoreria): Promise<CuentaTesoreriaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      await exigirAlcance(u, usuarioId, empresaId, datos.sucursalId ?? null);
      return u.crear(empresaId, datos);
    });
  }

  editar(
    usuarioId: string,
    empresaId: string,
    id: string,
    cambios: EditarCuentaTesoreria,
  ): Promise<CuentaTesoreriaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const actual = await u.cuenta(empresaId, id);
      await exigirAlcance(u, usuarioId, empresaId, actual.sucursalId);
      if (cambios.sucursalId !== undefined) await exigirAlcance(u, usuarioId, empresaId, cambios.sucursalId);
      return u.editar(empresaId, id, cambios);
    });
  }
}
