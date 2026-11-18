import { Inject, Injectable } from "@nestjs/common";
import type { Balanza, ConsultaBalanza, TipoBalanza } from "@contable/shared";
import { armarBalanza } from "../domain/balanza.js";
import { REPOSITORIO_BALANZA, type RepositorioBalanza } from "../domain/repositorio-balanza.js";
import { alcanceDelReporte, PERMISO_REPORTES } from "./alcance-reporte.js";

/**
 * Caso de uso: consultar una de las tres balanzas de comprobación (HU-30, S2-T29).
 *
 * El período debe estar dentro de un ejercicio. Las cuentas de balance arrastran el saldo de los ejercicios
 * anteriores y las de resultado parten de cero al inicio del ejercicio. Sin sucursal la balanza es
 * consolidada, pero quien está limitado a algunas sucursales solo suma las suyas.
 */
@Injectable()
export class ConsultarBalanza {
  constructor(@Inject(REPOSITORIO_BALANZA) private readonly repositorio: RepositorioBalanza) {}

  ejecutar(
    usuarioId: string,
    empresaId: string,
    tipo: TipoBalanza,
    consulta: ConsultaBalanza,
  ): Promise<Balanza> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const { sucursales, ejercicio } = await alcanceDelReporte(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_REPORTES,
        consulta,
      );
      const filas = await unidad.saldos({
        empresaId,
        tipo,
        desde: consulta.desde,
        hasta: consulta.hasta,
        inicioEjercicio: ejercicio.inicio,
        sucursales,
      });
      return armarBalanza(
        tipo,
        { desde: consulta.desde, hasta: consulta.hasta, sucursalId: consulta.sucursalId ?? null },
        filas,
      );
    });
  }
}
