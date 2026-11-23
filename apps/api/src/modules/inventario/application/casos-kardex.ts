import { Inject, Injectable } from "@nestjs/common";
import {
  ExistenciaInsuficienteError,
  ExistenciasProducto,
  armarKardex,
  costoTotalDeEntrada,
  type ConsultaKardex,
  type CrearMovimiento,
  type KardexVista,
  type MetodoValuacion,
  type MovimientoInventarioVista,
} from "@contable/shared";
import {
  REPOSITORIO_INVENTARIO,
  ReglaProductoError,
  SucursalNoAutorizadaError,
  SucursalNoEncontradaError,
  type RepositorioInventario,
  type UnidadInventario,
} from "../domain/producto.js";

/** Comprueba que la sucursal sea de la empresa y que el usuario pueda usarla. */
async function exigirSucursal(
  unidad: UnidadInventario,
  usuarioId: string,
  empresaId: string,
  sucursalId: string,
) {
  if (!(await unidad.existeSucursal(empresaId, sucursalId))) throw new SucursalNoEncontradaError();
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso || (!acceso.todasSucursales && !acceso.sucursales.includes(sucursalId))) {
    throw new SucursalNoAutorizadaError();
  }
}

/** Método del producto o, si no tiene uno propio, el de la empresa. */
async function metodoDe(unidad: UnidadInventario, empresaId: string, propio: MetodoValuacion | null) {
  return propio ?? (await unidad.metodoDeEmpresa(empresaId));
}

/**
 * Kardex de inventario (HU-65): registra entradas y salidas y arma el kardex de cada producto por sucursal.
 * El permiso (inventario.ver o inventario.registrar) lo exige el controlador; aquí se valida el acceso a la
 * sucursal y se aplica el método de valuación con decimales exactos.
 */
@Injectable()
export class CasosKardex {
  constructor(@Inject(REPOSITORIO_INVENTARIO) private readonly repositorio: RepositorioInventario) {}

  /**
   * Registra un movimiento. Una entrada guarda el costo unitario de la compra; una salida se valúa con el
   * método del producto (promedio ponderado o PEPS) y se rechaza si no hay existencias suficientes. Bloquea el
   * producto durante la operación para que dos registros simultáneos no se pisen.
   */
  registrar(
    usuarioId: string,
    empresaId: string,
    datos: CrearMovimiento,
  ): Promise<MovimientoInventarioVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigirSucursal(unidad, usuarioId, empresaId, datos.sucursalId);
      const producto = await unidad.producto(empresaId, datos.productoId);
      if (!producto.activo)
        throw new ReglaProductoError("El producto está inactivo: actívalo para registrar movimientos.");
      await unidad.bloquearProducto(producto.id);

      const metodo = await metodoDe(unidad, empresaId, producto.metodoValuacion);
      const existencias = new ExistenciasProducto(metodo);
      const previos = await unidad.movimientos(producto.id, datos.sucursalId);
      for (const m of previos) {
        if (m.tipo === "entrada") existencias.entrada(m.cantidad, m.costoTotal);
        else existencias.salida(m.cantidad);
      }
      const ultima = previos.at(-1)?.fecha;
      if (ultima && datos.fecha < ultima) {
        throw new ReglaProductoError(
          `No se puede registrar un movimiento anterior al último del producto en la sucursal (${ultima}).`,
        );
      }

      let costoTotal: string;
      let costoUnitario: string;
      if (datos.tipo === "entrada") {
        costoUnitario = datos.costoUnitario!;
        costoTotal = costoTotalDeEntrada(datos.cantidad, costoUnitario);
        existencias.entrada(datos.cantidad, costoTotal);
      } else {
        try {
          costoTotal = existencias.salida(datos.cantidad);
        } catch (e) {
          if (e instanceof ExistenciaInsuficienteError) throw new ReglaProductoError(e.message);
          throw e;
        }
        costoUnitario = (Number(costoTotal) / Number(datos.cantidad)).toFixed(4);
      }

      const id = await unidad.registrarMovimiento({
        empresaId,
        productoId: producto.id,
        sucursalId: datos.sucursalId,
        fecha: datos.fecha,
        tipo: datos.tipo,
        cantidad: datos.cantidad,
        costoUnitario,
        costoTotal,
        referencia: datos.referencia ?? null,
      });
      return {
        id,
        productoId: producto.id,
        sucursalId: datos.sucursalId,
        fecha: datos.fecha,
        tipo: datos.tipo,
        cantidad: datos.cantidad,
        costoUnitario,
        costoTotal,
        referencia: datos.referencia ?? null,
        saldo: existencias.saldo(),
      };
    });
  }

  consultar(
    usuarioId: string,
    empresaId: string,
    productoId: string,
    consulta: ConsultaKardex,
  ): Promise<KardexVista> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigirSucursal(unidad, usuarioId, empresaId, consulta.sucursalId);
      const producto = await unidad.producto(empresaId, productoId);
      const metodo = await metodoDe(unidad, empresaId, producto.metodoValuacion);
      const movimientos = await unidad.movimientos(producto.id, consulta.sucursalId, consulta.hasta);
      const kardex = armarKardex(movimientos, metodo, { desde: consulta.desde, hasta: consulta.hasta });
      return {
        productoId: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        unidadMedida: producto.unidadMedida,
        sucursalId: consulta.sucursalId,
        metodo,
        desde: consulta.desde ?? null,
        hasta: consulta.hasta ?? null,
        ...kardex,
      };
    });
  }
}
