import { Inject, Injectable } from "@nestjs/common";
import {
  AlcanceLiquidacionIvaIncompletoError,
  EmpresaLiquidacionIvaNoEncontradaError,
  REPOSITORIO_LIQUIDACION_IVA,
  SinPermisoLiquidacionIvaError,
  type RepositorioLiquidacionIva,
  type UnidadLiquidacionIva,
} from "../domain/liquidacion-iva.js";

async function exigir(
  unidad: UnidadLiquidacionIva,
  usuarioId: string,
  empresaId: string,
  permiso: string,
  mensaje: string,
): Promise<void> {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new EmpresaLiquidacionIvaNoEncontradaError();
  if (!acceso.permisos.has(permiso)) throw new SinPermisoLiquidacionIvaError(mensaje);
  // El F-07 es de toda la empresa: con acceso a una sola sucursal se vería una cifra parcial
  if (!acceso.todasSucursales) {
    throw new AlcanceLiquidacionIvaIncompletoError(
      "La liquidación del IVA se declara por empresa: requiere acceso a todas las sucursales.",
    );
  }
}

/** Liquidación mensual del IVA para el F-07 (HU-48). */
@Injectable()
export class CasosLiquidacionIva {
  constructor(@Inject(REPOSITORIO_LIQUIDACION_IVA) private readonly repositorio: RepositorioLiquidacionIva) {}

  consultar(usuarioId: string, empresaId: string, anio: number, mes: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(unidad, usuarioId, empresaId, "declaraciones.ver", "Su rol no permite ver el F-07.");
      return unidad.consultar(empresaId, anio, mes);
    });
  }

  generarPartida(usuarioId: string, empresaId: string, anio: number, mes: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(
        unidad,
        usuarioId,
        empresaId,
        "declaraciones.generar",
        "Su rol no permite generar la partida de liquidación del IVA.",
      );
      return unidad.generarPartida(empresaId, anio, mes);
    });
  }

  presentar(usuarioId: string, empresaId: string, anio: number, mes: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(
        unidad,
        usuarioId,
        empresaId,
        "declaraciones.generar",
        "Su rol no permite marcar el F-07 como presentado.",
      );
      return unidad.presentar(usuarioId, empresaId, anio, mes);
    });
  }

  /** Retenciones y percepciones del 1 % del mes (HU-50). */
  retencionesDelMes(usuarioId: string, empresaId: string, anio: number, mes: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(
        unidad,
        usuarioId,
        empresaId,
        "declaraciones.ver",
        "Su rol no permite ver las retenciones y percepciones.",
      );
      return unidad.retencionesDelMes(empresaId, anio, mes);
    });
  }
}
