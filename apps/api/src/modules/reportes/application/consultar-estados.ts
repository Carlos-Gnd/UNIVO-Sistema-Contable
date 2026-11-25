import { Inject, Injectable } from "@nestjs/common";
import type {
  BalanceGeneral,
  ConsultaBalanceGeneral,
  ConsultaCambiosPatrimonio,
  ConsultaEstadoResultados,
  EstadoCambiosPatrimonio,
  EstadoResultados,
} from "@contable/shared";
import { SinPermisoReportesError, type FilaSaldos } from "../domain/balanza.js";
import {
  armarBalanceGeneral,
  armarEstadoResultados,
  mayorDe,
  PERMISO_VER_ESTADOS,
} from "../domain/estados.js";
import { armarCambiosPatrimonio } from "../domain/patrimonio.js";
import {
  REPOSITORIO_ESTADOS,
  type RepositorioEstados,
  type UnidadEstados,
} from "../domain/repositorio-estados.js";
import { alcanceDelReporte } from "./alcance-reporte.js";

const PERMISO_ESTADOS = {
  codigo: PERMISO_VER_ESTADOS,
  error: () =>
    new SinPermisoReportesError("Su rol no permite consultar estados financieros en esta empresa."),
};

/** Nombres de las cuentas de mayor de las filas, para los renglones de los estados. */
const nombres = (unidad: UnidadEstados, empresaId: string, filas: readonly FilaSaldos[]) =>
  unidad.nombresDeMayor(empresaId, [...new Set(filas.map((f) => mayorDe(f.codigo)))]);

/**
 * Caso de uso: estado de resultados de un período (HU-37, S2-T42), por sucursal o consolidado, en el formato
 * pedido o en el de la empresa (HU-42). Usa los
 * movimientos del período de la balanza ajustada: incluye los ajustes y deja fuera las partidas de cierre,
 * que llevan las cuentas de resultado a cero. Por eso coincide con las columnas de resultados de la hoja de
 * trabajo, que también parten de la balanza ajustada.
 */
@Injectable()
export class ConsultarEstadoResultados {
  constructor(@Inject(REPOSITORIO_ESTADOS) private readonly repositorio: RepositorioEstados) {}

  ejecutar(
    usuarioId: string,
    empresaId: string,
    consulta: ConsultaEstadoResultados,
  ): Promise<EstadoResultados> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const { sucursales, ejercicio } = await alcanceDelReporte(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_ESTADOS,
        consulta,
      );
      const filas = await unidad.saldos({
        empresaId,
        tipo: "ajustada",
        desde: consulta.desde,
        hasta: consulta.hasta,
        inicioEjercicio: ejercicio.inicio,
        sucursales,
      });
      return armarEstadoResultados(
        { desde: consulta.desde, hasta: consulta.hasta, sucursalId: consulta.sucursalId ?? null },
        filas,
        await nombres(unidad, empresaId, filas),
        consulta.formato ?? (await unidad.parametrosEstados(empresaId)).formatoEstados,
      );
    });
  }
}

/**
 * Caso de uso: balance general a una fecha (HU-38, S2-T46), por sucursal o consolidado. Toma los saldos
 * finales a esa fecha con todas las partidas del ejercicio, incluido el cierre: después del cierre la
 * utilidad ya está en el patrimonio; antes, el armado la suma como utilidad del ejercicio en curso.
 */
@Injectable()
export class ConsultarBalanceGeneral {
  constructor(@Inject(REPOSITORIO_ESTADOS) private readonly repositorio: RepositorioEstados) {}

  ejecutar(usuarioId: string, empresaId: string, consulta: ConsultaBalanceGeneral): Promise<BalanceGeneral> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const { sucursales, ejercicio } = await alcanceDelReporte(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_ESTADOS,
        {
          desde: consulta.fecha,
          hasta: consulta.fecha,
          sucursalId: consulta.sucursalId,
        },
      );
      const filas = await unidad.saldos({
        empresaId,
        tipo: "posterior-cierre",
        desde: ejercicio.inicio,
        hasta: consulta.fecha,
        inicioEjercicio: ejercicio.inicio,
        sucursales,
      });
      return armarBalanceGeneral(
        { fecha: consulta.fecha, sucursalId: consulta.sucursalId ?? null },
        filas,
        await nombres(unidad, empresaId, filas),
        consulta.formato ?? (await unidad.parametrosEstados(empresaId)).formatoEstados,
      );
    });
  }
}

/**
 * Caso de uso: estado de cambios en el patrimonio de un período (HU-40, S3-T19), por sucursal o consolidado.
 * Parte de la balanza ajustada (sin las partidas de cierre) para que el saldo final coincida con el patrimonio
 * del balance general a la fecha final, esté o no cerrado el ejercicio.
 */
@Injectable()
export class ConsultarCambiosPatrimonio {
  constructor(@Inject(REPOSITORIO_ESTADOS) private readonly repositorio: RepositorioEstados) {}

  ejecutar(
    usuarioId: string,
    empresaId: string,
    consulta: ConsultaCambiosPatrimonio,
  ): Promise<EstadoCambiosPatrimonio> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const { sucursales, ejercicio } = await alcanceDelReporte(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_ESTADOS,
        consulta,
      );
      const filas = await unidad.saldos({
        empresaId,
        tipo: "ajustada",
        desde: consulta.desde,
        hasta: consulta.hasta,
        inicioEjercicio: ejercicio.inicio,
        sucursales,
      });
      const parametros = await unidad.parametrosEstados(empresaId);
      return armarCambiosPatrimonio(
        { desde: consulta.desde, hasta: consulta.hasta, sucursalId: consulta.sucursalId ?? null },
        parametros.tipoContribuyente,
        filas,
        consulta.formato ?? parametros.formatoEstados,
      );
    });
  }
}
