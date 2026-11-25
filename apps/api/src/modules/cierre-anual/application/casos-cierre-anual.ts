import { Inject, Injectable } from "@nestjs/common";
import type { CrearConfiguracionIsr } from "@contable/shared";
import {
  AlcanceCierreAnualIncompletoError,
  EmpresaCierreAnualNoEncontradaError,
  REPOSITORIO_CIERRE_ANUAL,
  SinPermisoCierreAnualError,
  type AccesoCierreAnual,
  type RepositorioCierreAnual,
  type UnidadCierreAnual,
} from "../domain/cierre-anual.js";

async function exigirAcceso(
  unidad: UnidadCierreAnual,
  usuarioId: string,
  empresaId: string,
  permiso: string,
  mensaje: string,
): Promise<AccesoCierreAnual> {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new EmpresaCierreAnualNoEncontradaError();
  if (!acceso.permisos.has(permiso)) throw new SinPermisoCierreAnualError(mensaje);
  return acceso;
}

function exigirTodasLasSucursales(acceso: AccesoCierreAnual): void {
  if (!acceso.todasSucursales) {
    throw new AlcanceCierreAnualIncompletoError(
      "El cierre anual consolidado requiere acceso a todas las sucursales de la empresa.",
    );
  }
}

@Injectable()
export class CasosCierreAnual {
  constructor(@Inject(REPOSITORIO_CIERRE_ANUAL) private readonly repositorio: RepositorioCierreAnual) {}

  estado(usuarioId: string, empresaId: string, anio: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        "declaraciones.ver",
        "Su rol no permite consultar el cierre anual de esta empresa.",
      );
      return unidad.estado(empresaId, anio, acceso);
    });
  }

  crearConfiguracion(usuarioId: string, empresaId: string, datos: CrearConfiguracionIsr) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        "declaraciones.generar",
        "Su rol no permite configurar el ISR del ejercicio.",
      );
      exigirTodasLasSucursales(acceso);
      return unidad.crearConfiguracion(usuarioId, empresaId, datos);
    });
  }

  calcularYProvisionar(usuarioId: string, empresaId: string, anio: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        "declaraciones.generar",
        "Su rol no permite calcular y generar la provisión anual del ISR.",
      );
      exigirTodasLasSucursales(acceso);
      return unidad.calcularYProvisionar(usuarioId, empresaId, anio);
    });
  }

  cerrarNoviembre(usuarioId: string, empresaId: string, anio: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        "periodos.cerrar",
        "Su rol no permite cerrar el período de noviembre.",
      );
      exigirTodasLasSucursales(acceso);
      await unidad.cerrarNoviembre(empresaId, anio, acceso);
      return unidad.estado(empresaId, anio, acceso);
    });
  }

  crearPartidaCierre(usuarioId: string, empresaId: string, anio: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        "periodos.cerrar",
        "Su rol no permite generar la partida de cierre anual.",
      );
      exigirTodasLasSucursales(acceso);
      return unidad.crearPartidaCierre(empresaId, anio, acceso);
    });
  }

  confirmarCierre(usuarioId: string, empresaId: string, anio: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        "periodos.cerrar",
        "Su rol no permite confirmar el cierre del ejercicio.",
      );
      exigirTodasLasSucursales(acceso);
      await unidad.confirmarCierre(empresaId, anio, acceso);
      return unidad.estado(empresaId, anio, acceso);
    });
  }

  crearPartidaReapertura(usuarioId: string, empresaId: string, anio: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await exigirAcceso(
        unidad,
        usuarioId,
        empresaId,
        "partidas.registrar",
        "Su rol no permite registrar la partida de reapertura.",
      );
      exigirTodasLasSucursales(acceso);
      return unidad.crearPartidaReapertura(empresaId, anio, acceso);
    });
  }
}
