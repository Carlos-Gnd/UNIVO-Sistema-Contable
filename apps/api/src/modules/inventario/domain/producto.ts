import type {
  MetodoValuacion,
  MovimientoParaKardex,
  CategoriaProducto,
  CrearCategoria,
  CrearProducto,
  EditarCategoria,
  EditarProducto,
  ProductoVista,
} from "@contable/shared";

/** El producto o la categoría no existe en la empresa. */
export class ProductoNoEncontradoError extends Error {
  constructor() {
    super("El producto no existe en esta empresa.");
  }
}
export class CategoriaNoEncontradaError extends Error {
  constructor() {
    super("La categoría no existe en esta empresa.");
  }
}
export class CodigoProductoDuplicadoError extends Error {
  constructor(codigo: string) {
    super(`Ya existe un producto con el código ${codigo} en esta empresa.`);
  }
}
export class CategoriaDuplicadaError extends Error {
  constructor(nombre: string) {
    super(`Ya existe una categoría llamada «${nombre}» en esta empresa.`);
  }
}
export class SucursalNoEncontradaError extends Error {
  constructor() {
    super("La sucursal no existe en esta empresa.");
  }
}
export class SucursalNoAutorizadaError extends Error {
  constructor() {
    super("No tienes acceso a esa sucursal.");
  }
}
/** Regla del negocio: por ejemplo, asignar una categoría inactiva a un producto. */
export class ReglaProductoError extends Error {}

export interface AccesoInventario {
  todasSucursales: boolean;
  sucursales: readonly string[];
}

export interface DatosMovimiento {
  empresaId: string;
  productoId: string;
  sucursalId: string;
  fecha: string;
  tipo: "entrada" | "salida";
  cantidad: string;
  costoUnitario: string;
  costoTotal: string;
  referencia: string | null;
}

export interface FiltroProductos {
  categoriaId?: string;
  /** Texto contenido en el código o el nombre */
  busqueda?: string;
  /** Sin valor, todos; true solo activos; false solo inactivos */
  activo?: boolean;
}

/** Operaciones dentro de una transacción a nombre del usuario (la bitácora registra quién hizo cada cambio). */
export interface UnidadInventario {
  categorias(empresaId: string): Promise<CategoriaProducto[]>;
  crearCategoria(empresaId: string, datos: CrearCategoria): Promise<CategoriaProducto>;
  editarCategoria(
    empresaId: string,
    categoriaId: string,
    cambios: EditarCategoria,
  ): Promise<CategoriaProducto>;
  productos(empresaId: string, filtro: FiltroProductos): Promise<ProductoVista[]>;
  producto(empresaId: string, productoId: string): Promise<ProductoVista>;
  crearProducto(empresaId: string, datos: CrearProducto): Promise<ProductoVista>;
  editarProducto(empresaId: string, productoId: string, cambios: EditarProducto): Promise<ProductoVista>;

  /** Sucursales que el usuario puede usar en la empresa, o null si no es miembro activo. */
  acceso(usuarioId: string, empresaId: string): Promise<AccesoInventario | null>;
  existeSucursal(empresaId: string, sucursalId: string): Promise<boolean>;
  metodoDeEmpresa(empresaId: string): Promise<MetodoValuacion>;
  /** Bloquea el producto hasta el fin de la transacción: un solo movimiento a la vez por producto. */
  bloquearProducto(productoId: string): Promise<void>;
  /** Movimientos del producto en la sucursal, por fecha y orden de registro, hasta la fecha indicada. */
  movimientos(productoId: string, sucursalId: string, hasta?: string): Promise<MovimientoParaKardex[]>;
  registrarMovimiento(datos: DatosMovimiento): Promise<string>;
}

export interface RepositorioInventario {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadInventario) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_INVENTARIO = Symbol("REPOSITORIO_INVENTARIO");
