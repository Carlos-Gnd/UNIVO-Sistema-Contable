import { Inject, Injectable } from "@nestjs/common";
import { MODULOS_BITACORA, type FiltrosBitacora, type PaginaBitacora } from "@contable/shared";
import {
  EmpresaNoEncontradaError,
  inicioDelDia,
  inicioDelDiaSiguiente,
  PERMISO_VER_BITACORA,
  REPOSITORIO_BITACORA,
  SinPermisoBitacoraError,
  type RepositorioBitacora,
} from "../domain/bitacora.js";

/**
 * Consultar la bitácora de auditoría de una empresa (HU-11, S1-T58), con filtros por usuario, rango de
 * fechas, módulo y acción, y paginación. Requiere el permiso bitacora.ver.
 */
@Injectable()
export class ConsultarBitacora {
  constructor(@Inject(REPOSITORIO_BITACORA) private readonly repositorio: RepositorioBitacora) {}

  async ejecutar(usuarioId: string, empresaId: string, filtros: FiltrosBitacora): Promise<PaginaBitacora> {
    const permisos = await this.repositorio.permisos(usuarioId, empresaId);
    if (!permisos) throw new EmpresaNoEncontradaError();
    if (!permisos.has(PERMISO_VER_BITACORA)) throw new SinPermisoBitacoraError();

    const { pagina, porPagina } = filtros;
    const { registros, total } = await this.repositorio.buscar({
      empresaId,
      usuarioId: filtros.usuarioId,
      tablas: filtros.modulo ? MODULOS_BITACORA[filtros.modulo].tablas : undefined,
      accion: filtros.accion,
      desde: filtros.desde ? inicioDelDia(filtros.desde) : undefined,
      antesDe: filtros.hasta ? inicioDelDiaSiguiente(filtros.hasta) : undefined,
      saltar: (pagina - 1) * porPagina,
      tomar: porPagina,
    });
    return { registros, total, pagina, porPagina, paginas: Math.ceil(total / porPagina) };
  }
}
