import { Module } from "@nestjs/common";
import { CasosTercero } from "./application/casos-tercero.js";
import { REPOSITORIO_COMERCIAL } from "./domain/tercero.js";
import { TercerosController } from "./infrastructure/http/terceros.controller.js";
import { RepositorioComercialPrisma } from "./infrastructure/repositorio-comercial.prisma.js";

/** Dominio comercial: clientes y proveedores (HU-58); las compras y ventas se apoyan en ellos. */
@Module({
  controllers: [TercerosController],
  providers: [CasosTercero, { provide: REPOSITORIO_COMERCIAL, useClass: RepositorioComercialPrisma }],
})
export class ComercialModule {}
