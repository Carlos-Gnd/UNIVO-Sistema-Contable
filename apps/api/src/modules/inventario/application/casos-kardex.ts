import { Inject, Injectable } from "@nestjs/common";
import {
  ExistenciaInsuficienteError,
  ExistenciasProducto,
  armarKardex,
  costoTotalDeEntrada,
  costoTotalDeSeries,
  costoUnitarioDeTotal,
  distribuirCostoPorUnidad,
  type ConsultaKardex,
  type ConsultaSeries,
  type CrearMovimiento,
  type KardexVista,
  type MetodoValuacionKardex,
  type MovimientoInventarioVista,
  type ProductoVista,
  type ProductoReabastecimientoVista,
  type SerieInventarioVista,
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
export async function exigirSucursal(
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
async function metodoDe(
  unidad: UnidadInventario,
  empresaId: string,
  producto: ProductoVista,
): Promise<MetodoValuacionKardex> {
  if (producto.controlaSeries) return "especifico";
  return producto.metodoValuacion ?? (await unidad.metodoDeEmpresa(empresaId));
}

/** La validación compartida normaliza cantidades a cuatro decimales; aquí se comprueba que sean unidades enteras. */
function unidadesEnteras(cantidad: string): bigint | null {
  const partes = /^(\d+)\.0000$/.exec(cantidad);
  return partes ? BigInt(partes[1]!) : null;
}

/**
 * Registra un movimiento en el kardex dentro de la transacción de la unidad recibida: así las compras y ventas
 * (HU-59, HU-60) lo reutilizan sin duplicar la valuación. Una entrada guarda el costo unitario de la compra; una
 * salida se valúa con el método del producto (promedio ponderado, PEPS o costo específico) y se rechaza si no hay
 * existencias suficientes. Bloquea el producto durante la operación para que dos registros simultáneos no se pisen.
 */
export async function registrarMovimientoKardex(
  unidad: UnidadInventario,
  usuarioId: string,
  empresaId: string,
  datos: CrearMovimiento,
): Promise<MovimientoInventarioVista> {
  await exigirSucursal(unidad, usuarioId, empresaId, datos.sucursalId);
  const producto = await unidad.producto(empresaId, datos.productoId);
  if (!producto.activo)
    throw new ReglaProductoError("El producto está inactivo: actívalo para registrar movimientos.");
  await unidad.bloquearProducto(producto.id);

  const metodo = await metodoDe(unidad, empresaId, producto);
  const existencias = new ExistenciasProducto(metodo);
  const previos = await unidad.movimientos(producto.id, datos.sucursalId);
  for (const m of previos) {
    if (m.tipo === "entrada") existencias.entrada(m.cantidad, m.costoTotal);
    else if (metodo === "especifico") existencias.salidaEspecifica(m.cantidad, m.costoTotal);
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
  let series: { numeroSerie: string; costoUnitario: string }[] | null = null;
  if (producto.controlaSeries) {
    const numeros = datos.series ?? [];
    const cantidadEntera = unidadesEnteras(datos.cantidad);
    if (cantidadEntera === null) {
      throw new ReglaProductoError("La cantidad de un producto controlado por serie debe ser entera.");
    }
    if (cantidadEntera !== BigInt(numeros.length)) {
      throw new ReglaProductoError("Registra o elige una serie por cada unidad del movimiento.");
    }

    if (datos.tipo === "entrada") {
      costoUnitario = datos.costoUnitario!;
      costoTotal = costoTotalDeEntrada(datos.cantidad, costoUnitario);
      const costos = distribuirCostoPorUnidad(costoTotal, numeros.length);
      series = numeros.map((numeroSerie, indice) => ({ numeroSerie, costoUnitario: costos[indice]! }));
      existencias.entrada(datos.cantidad, costoTotal);
    } else {
      const elegidas = await unidad.seriesDisponibles(empresaId, producto.id, datos.sucursalId, numeros);
      if (elegidas.length !== numeros.length) {
        throw new ReglaProductoError("Elige series que estén en existencia en esta sucursal.");
      }
      costoTotal = costoTotalDeSeries(elegidas.map((serie) => serie.costoUnitario));
      costoUnitario = costoUnitarioDeTotal(costoTotal, datos.cantidad);
      try {
        existencias.salidaEspecifica(datos.cantidad, costoTotal);
      } catch (e) {
        if (e instanceof ExistenciaInsuficienteError) throw new ReglaProductoError(e.message);
        throw e;
      }
      series = elegidas;
    }
  } else if (datos.series !== undefined) {
    throw new ReglaProductoError("Este producto no está configurado para controlar series.");
  } else if (datos.tipo === "entrada") {
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
    costoUnitario = costoUnitarioDeTotal(costoTotal, datos.cantidad);
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
    series,
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
}

/**
 * Kardex de inventario (HU-65): registra entradas y salidas y arma el kardex de cada producto por sucursal.
 * El permiso (inventario.ver o inventario.registrar) lo exige el controlador; aquí se valida el acceso a la
 * sucursal y se aplica el método de valuación con decimales exactos.
 */
@Injectable()
export class CasosKardex {
  constructor(@Inject(REPOSITORIO_INVENTARIO) private readonly repositorio: RepositorioInventario) {}

  /** Registra un movimiento en su propia transacción a nombre del usuario. */
  registrar(
    usuarioId: string,
    empresaId: string,
    datos: CrearMovimiento,
  ): Promise<MovimientoInventarioVista> {
    return this.repositorio.enTransaccion(usuarioId, (unidad) =>
      registrarMovimientoKardex(unidad, usuarioId, empresaId, datos),
    );
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
      const metodo = await metodoDe(unidad, empresaId, producto);
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

  consultarSeries(
    usuarioId: string,
    empresaId: string,
    productoId: string,
    consulta: ConsultaSeries,
  ): Promise<SerieInventarioVista[]> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigirSucursal(unidad, usuarioId, empresaId, consulta.sucursalId);
      const producto = await unidad.producto(empresaId, productoId);
      return unidad.series(empresaId, producto.id, consulta.sucursalId, consulta.estado);
    });
  }

  consultarReabastecimiento(
    usuarioId: string,
    empresaId: string,
    sucursalId: string,
  ): Promise<ProductoReabastecimientoVista[]> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigirSucursal(unidad, usuarioId, empresaId, sucursalId);
      return unidad.productosPorReabastecer(empresaId, sucursalId);
    });
  }
}
