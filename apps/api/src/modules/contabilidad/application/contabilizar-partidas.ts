import { Inject, Injectable } from "@nestjs/common";
import type { PartidaContabilizada, PartidaRechazada, ResultadoContabilizacion } from "@contable/shared";
import { motivoParaNoContabilizar, ReglaContableError, SinPermisoError } from "../domain/contabilizacion.js";
import {
  REPOSITORIO_CONTABILIZACION,
  type RepositorioContabilizacion,
} from "../domain/repositorio-contabilizacion.js";

/**
 * Caso de uso: contabilizar una o varias partidas en borrador (HU-22, tareas S1-T84 y S1-T85).
 *
 * Todo ocurre en una transacción: se bloquean las partidas, se contabilizan en orden de fecha y cada
 * una recibe el siguiente correlativo de su ámbito. Las que no cumplen se quedan en la bandeja sin
 * consumir número; las demás se contabilizan igual.
 */
@Injectable()
export class ContabilizarPartidas {
  constructor(
    @Inject(REPOSITORIO_CONTABILIZACION) private readonly repositorio: RepositorioContabilizacion,
  ) {}

  ejecutar(usuarioId: string, empresaId: string, ids: string[]): Promise<ResultadoContabilizacion> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await unidad.acceso(usuarioId, empresaId);
      if (!acceso?.puedeContabilizar) throw new SinPermisoError();

      const partidas = await unidad.bloquearPartidas(empresaId, ids);
      const encontradas = new Set(partidas.map((p) => p.id));
      const rechazadas: PartidaRechazada[] = ids
        .filter((id) => !encontradas.has(id))
        .map((id) => ({ id, motivo: "no_encontrada", mensaje: "La partida no existe en esta empresa." }));
      const contabilizadas: PartidaContabilizada[] = [];

      for (const partida of partidas) {
        const rechazo = motivoParaNoContabilizar(partida, acceso);
        if (rechazo) {
          rechazadas.push(rechazo);
          continue;
        }
        try {
          contabilizadas.push({ id: partida.id, ...(await unidad.contabilizar(partida.id)) });
        } catch (e) {
          if (!(e instanceof ReglaContableError)) throw e;
          rechazadas.push({ id: partida.id, motivo: "regla_contable", mensaje: e.message });
        }
      }
      return { contabilizadas, rechazadas };
    });
  }
}
