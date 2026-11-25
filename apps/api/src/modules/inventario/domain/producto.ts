import type {
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
/** Regla del negocio: por ejemplo, asignar una categoría inactiva a un producto. */
export class ReglaProductoError extends Error {}

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
}

export interface RepositorioInventario {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadInventario) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_INVENTARIO = Symbol("REPOSITORIO_INVENTARIO");
