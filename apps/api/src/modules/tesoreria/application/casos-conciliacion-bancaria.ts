import { Inject, Injectable } from "@nestjs/common";
import type {
  ActualizarDetalleConciliacion,
  ConciliacionBancariaVista,
  CrearConciliacionBancaria,
  ResultadoImportacionEstadoCuenta,
} from "@contable/shared";
import {
  ConciliacionCuentaNoEncontradaError,
  ConciliacionEmpresaNoEncontradaError,
  ConciliacionSucursalNoAutorizadaError,
  REPOSITORIO_CONCILIACION,
  type AccesoConciliacion,
  type RepositorioConciliacion,
  type UnidadConciliacion,
} from "../domain/conciliacion-bancaria.js";
import { parsearEstadoCuentaCsv } from "./estado-cuenta-csv.js";

async function obtenerAcceso(unidad: UnidadConciliacion, usuarioId: string, empresaId: string) {
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new ConciliacionEmpresaNoEncontradaError();
  return acceso;
}

function exigirCuenta(
  cuenta: { tipo: string; activa: boolean; sucursalId: string | null },
  acceso: AccesoConciliacion,
) {
  if (!cuenta.activa || cuenta.tipo !== "banco") throw new ConciliacionCuentaNoEncontradaError();
  if (cuenta.sucursalId === null && !acceso.todasSucursales)
    throw new ConciliacionSucursalNoAutorizadaError();
  if (cuenta.sucursalId && !acceso.todasSucursales && !acceso.sucursales.includes(cuenta.sucursalId)) {
    throw new ConciliacionSucursalNoAutorizadaError();
  }
}

@Injectable()
export class CasosConciliacionBancaria {
  constructor(@Inject(REPOSITORIO_CONCILIACION) private readonly repositorio: RepositorioConciliacion) {}

  crear(
    usuarioId: string,
    empresaId: string,
    datos: CrearConciliacionBancaria,
  ): Promise<ConciliacionBancariaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await obtenerAcceso(unidad, usuarioId, empresaId);
      const cuenta = await unidad.cuenta(empresaId, datos.cuentaTesoreriaId);
      exigirCuenta(cuenta, acceso);
      return unidad.crear(usuarioId, empresaId, datos);
    });
  }

  detalle(usuarioId: string, empresaId: string, id: string): Promise<ConciliacionBancariaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await obtenerAcceso(unidad, usuarioId, empresaId);
      const resultado = await unidad.detalle(empresaId, id);
      const cuenta = await unidad.cuenta(empresaId, resultado.cuentaTesoreriaId);
      exigirCuenta(cuenta, acceso);
      return resultado;
    });
  }

  marcar(
    usuarioId: string,
    empresaId: string,
    id: string,
    datos: ActualizarDetalleConciliacion,
  ): Promise<ConciliacionBancariaVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await obtenerAcceso(unidad, usuarioId, empresaId);
      const conciliacion = await unidad.detalle(empresaId, id);
      const cuenta = await unidad.cuenta(empresaId, conciliacion.cuentaTesoreriaId);
      exigirCuenta(cuenta, acceso);
      return unidad.marcar(empresaId, id, datos);
    });
  }

  async estadoCuenta(
    usuarioId: string,
    empresaId: string,
    id: string,
    archivo: Buffer,
    guardar: boolean,
  ): Promise<ResultadoImportacionEstadoCuenta[]> {
    const parseado = parsearEstadoCuentaCsv(archivo);
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const acceso = await obtenerAcceso(unidad, usuarioId, empresaId);
      const conciliacion = await unidad.detalle(empresaId, id);
      const cuenta = await unidad.cuenta(empresaId, conciliacion.cuentaTesoreriaId);
      exigirCuenta(cuenta, acceso);
      const resultados = await unidad.estadoCuenta(empresaId, id, parseado.filas, guardar);
      return [
        ...resultados,
        ...parseado.errores.map((fila) => ({
          numeroFila: fila.numeroFila,
          fecha: fila.fecha,
          referencia: fila.referencia,
          descripcion: fila.descripcion,
          monto: fila.monto,
          estado: fila.detalle.includes("duplicada") ? ("duplicada" as const) : ("error" as const),
          detalle: fila.detalle,
          partidaDetalleId: null,
        })),
      ].sort((a, b) => a.numeroFila - b.numeroFila);
    });
  }
}
