import { Inject, Injectable } from "@nestjs/common";
import {
  conceptoDeReversion,
  exigirAnulable,
  FechaReversionInvalidaError,
  lineasDeReversion,
  MAXIMO_MOTIVO_ANULACION,
  MotivoAnulacionRequeridoError,
  PERMISO_ANULAR_PARTIDAS,
  type ResultadoAnulacion,
} from "../domain/anulacion.js";
import {
  EmpresaNoEncontradaError,
  PartidaNoEncontradaError,
  puedeUsarSucursal,
  SinPermisoPartidasError,
} from "../domain/partida-borrador.js";
import { REPOSITORIO_ANULACION, type RepositorioAnulacion } from "../domain/repositorio-anulacion.js";

/** Fecha de hoy (AAAA-MM-DD) en El Salvador, que no depende de la zona horaria del servidor. */
export const hoyEnElSalvador = (ahora: Date = new Date()) =>
  ahora.toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

/**
 * Caso de uso: anular una partida contabilizada mediante una partida de reversión (HU-24, S2-T11).
 *
 * Nada se borra: se registra y contabiliza una partida de tipo reversión que invierte el debe y el haber de
 * la original y la referencia, y la original queda marcada como anulada con su motivo. Todo ocurre en una
 * transacción: si la reversión no se puede registrar (por ejemplo, su período está cerrado), la original
 * no se anula.
 */
@Injectable()
export class AnularPartida {
  constructor(@Inject(REPOSITORIO_ANULACION) private readonly repositorio: RepositorioAnulacion) {}

  ejecutar(
    usuarioId: string,
    empresaId: string,
    partidaId: string,
    datos: { motivo: string; fecha?: string },
  ): Promise<ResultadoAnulacion> {
    const motivo = datos.motivo.trim();
    if (!motivo || motivo.length > MAXIMO_MOTIVO_ANULACION) throw new MotivoAnulacionRequeridoError();

    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await unidad.acceso(usuarioId, empresaId);
      if (!acceso) throw new EmpresaNoEncontradaError();
      if (!acceso.permisos.has(PERMISO_ANULAR_PARTIDAS)) {
        throw new SinPermisoPartidasError("Su rol no permite anular partidas en esta empresa.");
      }

      const original = await unidad.bloquear(empresaId, partidaId);
      // Una partida de una sucursal que no ve se trata como inexistente, igual que la de otra empresa
      if (!original || !puedeUsarSucursal(acceso, original.sucursalId)) throw new PartidaNoEncontradaError();
      exigirAnulable(original);

      const fecha = datos.fecha ?? hoyEnElSalvador();
      if (fecha < original.fecha) throw new FechaReversionInvalidaError(original.fecha);

      const reversionId = await unidad.crearReversion(empresaId, {
        partidaRevertidaId: original.id,
        sucursalId: original.sucursalId,
        fecha,
        concepto: conceptoDeReversion(original, motivo),
        documentoTipo: original.documentoTipo,
        documentoNumero: original.documentoNumero,
        lineas: lineasDeReversion(original.lineas),
      });
      const numeroReversion = await unidad.contabilizar(reversionId);
      await unidad.anular(original.id, motivo);

      return {
        // exigirAnulable garantiza que la original está contabilizada y por eso tiene número y ámbito
        original: { id: original.id, numero: original.numero ?? 0, ambito: original.ambito ?? "" },
        reversion: { id: reversionId, fecha, ...numeroReversion },
      };
    });
  }
}
