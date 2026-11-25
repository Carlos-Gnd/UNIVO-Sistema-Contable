import { Module } from "@nestjs/common";
import { CasosKardex } from "./application/casos-kardex.js";
import { CasosInventario } from "./application/casos-producto.js";
import { CasosTomaFisica } from "./application/casos-toma-fisica.js";
import { ConsultarInventarioAnalitico } from "./application/consultar-inventario-analitico.js";
import { REPOSITORIO_INVENTARIO } from "./domain/producto.js";
import {
  CategoriasProductoController,
  MovimientosInventarioController,
  ProductosController,
} from "./infrastructure/http/productos.controller.js";
import { TomasFisicasController } from "./infrastructure/http/tomas-fisicas.controller.js";
import { InventarioAnaliticoController } from "./infrastructure/http/inventario-analitico.controller.js";
import { RepositorioInventarioPrisma } from "./infrastructure/repositorio-inventario.prisma.js";

/** Dominio inventario: productos y categorías (HU-64); el kardex (HU-65) se apoya en ellos. */
@Module({
  controllers: [
    CategoriasProductoController,
    ProductosController,
    MovimientosInventarioController,
    TomasFisicasController,
    InventarioAnaliticoController,
  ],
  providers: [
    CasosInventario,
    CasosKardex,
    CasosTomaFisica,
    ConsultarInventarioAnalitico,
    { provide: REPOSITORIO_INVENTARIO, useClass: RepositorioInventarioPrisma },
  ],
})
export class InventarioModule {}
