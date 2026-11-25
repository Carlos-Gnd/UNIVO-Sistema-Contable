import { Inject, Injectable } from "@nestjs/common";
import type {
  CategoriaProducto,
  CrearCategoria,
  CrearProducto,
  EditarCategoria,
  EditarProducto,
  ProductoVista,
} from "@contable/shared";
import {
  REPOSITORIO_INVENTARIO,
  type FiltroProductos,
  type RepositorioInventario,
} from "../domain/producto.js";

/**
 * Productos y categorías del inventario (HU-64). El permiso (inventario.ver o inventario.registrar) lo exige
 * el controlador con @Permiso; aquí cada operación corre en una transacción a nombre del usuario para que la
 * bitácora registre quién creó o cambió cada registro.
 */
@Injectable()
export class CasosInventario {
  constructor(@Inject(REPOSITORIO_INVENTARIO) private readonly repositorio: RepositorioInventario) {}

  categorias(usuarioId: string, empresaId: string): Promise<CategoriaProducto[]> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.categorias(empresaId));
  }

  crearCategoria(usuarioId: string, empresaId: string, datos: CrearCategoria): Promise<CategoriaProducto> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.crearCategoria(empresaId, datos));
  }

  editarCategoria(
    usuarioId: string,
    empresaId: string,
    categoriaId: string,
    cambios: EditarCategoria,
  ): Promise<CategoriaProducto> {
    return this.repositorio.enTransaccion(usuarioId, (u) =>
      u.editarCategoria(empresaId, categoriaId, cambios),
    );
  }

  productos(usuarioId: string, empresaId: string, filtro: FiltroProductos): Promise<ProductoVista[]> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.productos(empresaId, filtro));
  }

  producto(usuarioId: string, empresaId: string, productoId: string): Promise<ProductoVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.producto(empresaId, productoId));
  }

  crearProducto(usuarioId: string, empresaId: string, datos: CrearProducto): Promise<ProductoVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.crearProducto(empresaId, datos));
  }

  editarProducto(
    usuarioId: string,
    empresaId: string,
    productoId: string,
    cambios: EditarProducto,
  ): Promise<ProductoVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) => u.editarProducto(empresaId, productoId, cambios));
  }
}
