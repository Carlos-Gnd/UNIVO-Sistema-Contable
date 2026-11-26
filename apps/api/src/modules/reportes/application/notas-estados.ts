import { Inject, Injectable } from "@nestjs/common";
import type {
  ClaveNota,
  ConsultaNotasEstados,
  GuardarNota,
  NotasEstados,
  VersionNota,
} from "@contable/shared";
import {
  EmpresaNoEncontradaError,
  PeriodoFueraDeEjercicioError,
  SinPermisoReportesError,
} from "../domain/balanza.js";
import { mayorDe, PERMISO_VER_ESTADOS } from "../domain/estados.js";
import { armarNotas } from "../domain/notas.js";
import {
  REPOSITORIO_ESTADOS,
  type RepositorioEstados,
  type UnidadEstados,
} from "../domain/repositorio-estados.js";
import { alcanceDelReporte } from "./alcance-reporte.js";

/** Redactar las notas es parte de preparar y firmar los estados: lo hacen el administrador y el contador. */
export const PERMISO_REDACTAR_NOTAS = "estados.firmar";

const PERMISO_ESTADOS = {
  codigo: PERMISO_VER_ESTADOS,
  error: () =>
    new SinPermisoReportesError("Su rol no permite consultar estados financieros en esta empresa."),
};

/** El usuario pertenece a la empresa y tiene el permiso, y la fecha cae en un ejercicio de la empresa. */
async function validarAcceso(
  unidad: UnidadEstados,
  usuarioId: string,
  empresaId: string,
  permiso: string,
  mensajeSinPermiso: string,
  fecha: string,
): Promise<number> {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new EmpresaNoEncontradaError();
  if (!acceso.permisos.has(permiso)) throw new SinPermisoReportesError(mensajeSinPermiso);
  const anio = await unidad.anioDelEjercicio(empresaId, fecha);
  if (anio === null) throw new PeriodoFueraDeEjercicioError(`No hay un ejercicio que contenga el ${fecha}.`);
  return anio;
}

/**
 * Caso de uso: notas a los estados financieros (HU-44, S3-T31). El texto es de la empresa y del ejercicio del
 * período (el vigente es la última versión guardada); las cifras y tablas salen de la balanza ajustada del
 * período y de la sucursal consultadas, así que siempre coinciden con los estados.
 */
@Injectable()
export class ConsultarNotasEstados {
  constructor(@Inject(REPOSITORIO_ESTADOS) private readonly repositorio: RepositorioEstados) {}

  ejecutar(usuarioId: string, empresaId: string, consulta: ConsultaNotasEstados): Promise<NotasEstados> {
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
      const empresa = await unidad.datosEmpresaNotas(empresaId);
      const mayores = [...new Set(filas.map((f) => mayorDe(f.codigo)))];
      return {
        desde: consulta.desde,
        hasta: consulta.hasta,
        sucursalId: consulta.sucursalId ?? null,
        ejercicioAnio: (await unidad.anioDelEjercicio(empresaId, consulta.desde)) ?? 0,
        notas: armarNotas(
          empresa,
          filas,
          await unidad.nombresDeMayor(empresaId, mayores),
          await unidad.notasVigentes(empresaId, consulta.desde),
        ),
      };
    });
  }
}

/** Caso de uso: guarda el texto de una nota como una versión nueva (HU-44). Requiere estados.firmar. */
@Injectable()
export class GuardarNotaEstado {
  constructor(@Inject(REPOSITORIO_ESTADOS) private readonly repositorio: RepositorioEstados) {}

  ejecutar(
    usuarioId: string,
    empresaId: string,
    clave: ClaveNota,
    datos: GuardarNota,
  ): Promise<{ clave: ClaveNota; version: number }> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await validarAcceso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_REDACTAR_NOTAS,
        "Su rol no permite redactar las notas a los estados financieros.",
        datos.fecha,
      );
      return { clave, version: await unidad.guardarNota(empresaId, datos.fecha, clave, datos.texto) };
    });
  }
}

/** Caso de uso: historial de versiones de una nota (HU-44). Requiere estados.ver. */
@Injectable()
export class ConsultarVersionesNota {
  constructor(@Inject(REPOSITORIO_ESTADOS) private readonly repositorio: RepositorioEstados) {}

  ejecutar(usuarioId: string, empresaId: string, clave: ClaveNota, fecha: string): Promise<VersionNota[]> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await validarAcceso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_VER_ESTADOS,
        PERMISO_ESTADOS.error().message,
        fecha,
      );
      return unidad.versionesDeNota(empresaId, fecha, clave);
    });
  }
}
