import { Inject, Injectable } from "@nestjs/common";
import type { Balanza, ConsultaBalanza, TipoBalanza } from "@contable/shared";
import {
  armarBalanza,
  EmpresaNoEncontradaError,
  PERMISO_VER_REPORTES,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
  SucursalNoAutorizadaError,
} from "../domain/balanza.js";
import { REPOSITORIO_BALANZA, type RepositorioBalanza } from "../domain/repositorio-balanza.js";

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
      const acceso = await unidad.acceso(usuarioId, empresaId);
      if (!acceso) throw new EmpresaNoEncontradaError();
      if (!acceso.permisos.has(PERMISO_VER_REPORTES)) throw new SinPermisoReportesError();

      let sucursales: readonly string[] | null = acceso.todasSucursales ? null : acceso.sucursales;
      if (consulta.sucursalId) {
        const permitida = acceso.todasSucursales || acceso.sucursales.includes(consulta.sucursalId);
        if (!permitida || !(await unidad.existeSucursal(empresaId, consulta.sucursalId))) {
          throw new SucursalNoAutorizadaError();
        }
        sucursales = [consulta.sucursalId];
      }

      const ejercicio = await unidad.ejercicioDe(empresaId, consulta.desde);
      if (!ejercicio) {
        throw new PeriodoFueraDeEjercicioError(`No hay un ejercicio que contenga el ${consulta.desde}.`);
      }
      if (consulta.hasta > ejercicio.fin) {
        throw new PeriodoFueraDeEjercicioError(
          `El período debe estar dentro de un mismo ejercicio, que termina el ${ejercicio.fin}.`,
        );
      }

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
