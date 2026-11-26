import { Inject, Injectable } from "@nestjs/common";
import {
  AlcancePagoACuentaIncompletoError,
  EmpresaPagoACuentaNoEncontradaError,
  REPOSITORIO_PAGO_A_CUENTA,
  SinPermisoPagoACuentaError,
  type AccesoPagoACuenta,
  type RepositorioPagoACuenta,
  type UnidadPagoACuenta,
} from "../domain/pago-a-cuenta.js";

async function exigir(
  unidad: UnidadPagoACuenta,
  usuarioId: string,
  empresaId: string,
  permiso: string,
  mensaje: string,
): Promise<AccesoPagoACuenta> {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new EmpresaPagoACuentaNoEncontradaError();
  if (!acceso.permisos.has(permiso)) throw new SinPermisoPagoACuentaError(mensaje);
  // El F-14 es de toda la empresa: con acceso a una sola sucursal se vería una cifra parcial
  if (!acceso.todasSucursales) {
    throw new AlcancePagoACuentaIncompletoError(
      "El pago a cuenta y las retenciones se declaran por empresa: requiere acceso a todas las sucursales.",
    );
  }
  return acceso;
}

/** Pago a cuenta del 1.75 % y retenciones de renta para el F-14 (HU-49). */
@Injectable()
export class CasosPagoACuenta {
  constructor(@Inject(REPOSITORIO_PAGO_A_CUENTA) private readonly repositorio: RepositorioPagoACuenta) {}

  consultar(usuarioId: string, empresaId: string, anio: number, mes: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(unidad, usuarioId, empresaId, "declaraciones.ver", "Su rol no permite ver el F-14.");
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
        "Su rol no permite generar la partida del pago a cuenta.",
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
        "Su rol no permite marcar el F-14 como presentado.",
      );
      return unidad.presentar(usuarioId, empresaId, anio, mes);
    });
  }

  ejercicio(usuarioId: string, empresaId: string, anio: number) {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(unidad, usuarioId, empresaId, "declaraciones.ver", "Su rol no permite ver el F-14.");
      return unidad.ejercicio(empresaId, anio);
    });
  }
}
