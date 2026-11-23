import { Module } from "@nestjs/common";
import { CasosInventario } from "./application/casos-producto.js";
import { REPOSITORIO_INVENTARIO } from "./domain/producto.js";
import {
  CategoriasProductoController,
  ProductosController,
} from "./infrastructure/http/productos.controller.js";
import { RepositorioInventarioPrisma } from "./infrastructure/repositorio-inventario.prisma.js";

/** Dominio inventario: productos y categorías (HU-64); el kardex (HU-65) se apoya en ellos. */
@Module({
  controllers: [CategoriasProductoController, ProductosController],
  providers: [CasosInventario, { provide: REPOSITORIO_INVENTARIO, useClass: RepositorioInventarioPrisma }],
})
export class InventarioModule {}
