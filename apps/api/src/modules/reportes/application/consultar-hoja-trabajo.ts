import { Inject, Injectable } from "@nestjs/common";
import type { ConsultaHojaTrabajo, HojaTrabajo } from "@contable/shared";
import { SinPermisoReportesError } from "../domain/balanza.js";
import { armarBalanza } from "../domain/balanza.js";
import { armarHojaTrabajo } from "../domain/hoja-trabajo.js";
import { PERMISO_VER_ESTADOS } from "../domain/estados.js";
import { REPOSITORIO_ESTADOS, type RepositorioEstados } from "../domain/repositorio-estados.js";
import { alcanceDelReporte } from "./alcance-reporte.js";

const PERMISO_HOJA_TRABAJO = {
  codigo: PERMISO_VER_ESTADOS,
  error: () => new SinPermisoReportesError("Su rol no permite consultar la hoja de trabajo en esta empresa."),
};

/** Consulta la hoja y sus dos fuentes de saldos dentro de una sola transacción. */
@Injectable()
export class ConsultarHojaTrabajo {
  constructor(@Inject(REPOSITORIO_ESTADOS) private readonly repositorio: RepositorioEstados) {}

  ejecutar(usuarioId: string, empresaId: string, consulta: ConsultaHojaTrabajo): Promise<HojaTrabajo> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const { sucursales, ejercicio } = await alcanceDelReporte(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_HOJA_TRABAJO,
        consulta,
      );
      const filtros = {
        empresaId,
        desde: consulta.desde,
        hasta: consulta.hasta,
        inicioEjercicio: ejercicio.inicio,
        sucursales,
      };
      const filasAntes = await unidad.saldos({ ...filtros, tipo: "antes-ajustes" });
      const filasAjustadas = await unidad.saldos({ ...filtros, tipo: "ajustada" });
      const periodo = {
        desde: consulta.desde,
        hasta: consulta.hasta,
        sucursalId: consulta.sucursalId ?? null,
      };
      return armarHojaTrabajo(
        periodo,
        armarBalanza("antes-ajustes", periodo, filasAntes),
        armarBalanza("ajustada", periodo, filasAjustadas),
      );
    });
  }
}
