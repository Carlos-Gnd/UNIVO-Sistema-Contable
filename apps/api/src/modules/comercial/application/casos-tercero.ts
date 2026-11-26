import { Inject, Injectable } from "@nestjs/common";
import type { CrearTercero, EditarTercero, TerceroVista } from "@contable/shared";
import { REPOSITORIO_COMERCIAL, type FiltroTerceros, type RepositorioComercial } from "../domain/tercero.js";

/**
 * Clientes y proveedores (HU-58). El permiso (terceros.ver o terceros.registrar) lo exige el controlador; cada
 * operación corre en una transacción a nombre del usuario para que la bitácora registre al autor.
 */
@Injectable()
export class CasosTercero {
  constructor(@Inject(REPOSITORIO_COMERCIAL) private readonly repositorio: RepositorioComercial) {}

  lista(usuarioId: string, empresaId: string, filtro: FiltroTerceros): Promise<TerceroVista[]> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.terceros(empresaId, filtro));
  }

  uno(usuarioId: string, empresaId: string, terceroId: string): Promise<TerceroVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.tercero(empresaId, terceroId));
  }

  crear(usuarioId: string, empresaId: string, datos: CrearTercero): Promise<TerceroVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.crearTercero(empresaId, datos));
  }

  editar(
    usuarioId: string,
    empresaId: string,
    terceroId: string,
    cambios: EditarTercero,
  ): Promise<TerceroVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.editarTercero(empresaId, terceroId, cambios));
  }
}
