import { Dinero, type InventarioAnaliticoVista, type SistemaInventario } from "@contable/shared";

export interface FilaInventarioFinalAnalitico {
  sucursalId: string;
  sucursal: string;
  fechaToma: string | null;
  valor: string | null;
}

export interface DatosInventarioAnalitico {
  sistemaInventario: SistemaInventario;
  inventarioInicial: string;
  compras: string;
  gastosSobreCompras: string;
  devolucionesYRebajas: string;
  inventarioFinalPorSucursal: readonly FilaInventarioFinalAnalitico[];
}

export class InventarioAnaliticoNoEncontradoError extends Error {
  constructor() {
    super("La empresa no existe o no tienes acceso a ella.");
  }
}

export class SistemaInventarioAnaliticoRequeridoError extends Error {
  constructor() {
    super("Configura el sistema de inventario analítico en los parámetros de la empresa.");
  }
}

export class SinSucursalInventarioAnaliticoError extends Error {
  constructor() {
    super("No tienes acceso a las sucursales de esta empresa.");
  }
}

/** Aplica la fórmula del inventario periódico con montos exactos al centavo. */
export function armarInventarioAnalitico(
  datos: DatosInventarioAnalitico,
  filtros: { desde: string; hasta: string; sucursalId?: string },
): InventarioAnaliticoVista {
  const comprasNetas = Dinero.de(datos.compras)
    .mas(datos.gastosSobreCompras)
    .menos(datos.devolucionesYRebajas);
  const inventarioFinalCompleto = datos.inventarioFinalPorSucursal.every((fila) => fila.valor !== null);
  const inventarioFinal = inventarioFinalCompleto
    ? Dinero.sumar(datos.inventarioFinalPorSucursal.map((fila) => fila.valor ?? "0.00")).aTexto()
    : null;

  return {
    desde: filtros.desde,
    hasta: filtros.hasta,
    sucursalId: filtros.sucursalId ?? null,
    inventarioInicial: Dinero.de(datos.inventarioInicial).aTexto(),
    compras: Dinero.de(datos.compras).aTexto(),
    gastosSobreCompras: Dinero.de(datos.gastosSobreCompras).aTexto(),
    devolucionesYRebajas: Dinero.de(datos.devolucionesYRebajas).aTexto(),
    comprasNetas: comprasNetas.aTexto(),
    inventarioFinal,
    costoVentas:
      inventarioFinal === null
        ? null
        : Dinero.de(datos.inventarioInicial).mas(comprasNetas).menos(inventarioFinal).aTexto(),
    inventarioFinalPorSucursal: [...datos.inventarioFinalPorSucursal],
  };
}
