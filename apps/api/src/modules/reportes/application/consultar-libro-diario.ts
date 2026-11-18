import { Inject, Injectable } from "@nestjs/common";
import type { ConsultaLibroDiario, LibroDiario } from "@contable/shared";
import { armarLibroDiario } from "../domain/libro-diario.js";
import { REPOSITORIO_DIARIO, type RepositorioDiario } from "../domain/repositorio-diario.js";
import { alcanceDelReporte, PERMISO_REPORTES } from "./alcance-reporte.js";

/**
 * Caso de uso: libro diario en el formato de clase (HU-25, S2-T15 y S2-T16), con filtros de fechas, tipo de
 * partida y sucursal, foliado con los totales Vienen y Pasan por página. Entran las partidas contabilizadas
 * y las anuladas: la anulada y su reversión quedan las dos en el libro, como en el registro legal.
 */
@Injectable()
export class ConsultarLibroDiario {
  constructor(@Inject(REPOSITORIO_DIARIO) private readonly repositorio: RepositorioDiario) {}

  ejecutar(usuarioId: string, empresaId: string, consulta: ConsultaLibroDiario): Promise<LibroDiario> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const { sucursales } = await alcanceDelReporte(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_REPORTES,
        consulta,
      );
      const partidas = await unidad.partidasDelDiario({
        empresaId,
        desde: consulta.desde,
        hasta: consulta.hasta,
        tipo: consulta.tipo ?? null,
        sucursales,
      });
      return armarLibroDiario(consulta, partidas);
    });
  }
}
