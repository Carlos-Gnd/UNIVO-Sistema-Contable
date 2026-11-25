import { Module } from "@nestjs/common";
import { CasosDocumento } from "./application/casos-documento.js";
import { CasosTercero } from "./application/casos-tercero.js";
import { REPOSITORIO_COMERCIAL } from "./domain/tercero.js";
import { ComprasController } from "./infrastructure/http/compras.controller.js";
import { TercerosController } from "./infrastructure/http/terceros.controller.js";
import { RepositorioComercialPrisma } from "./infrastructure/repositorio-comercial.prisma.js";

/** Dominio comercial: clientes y proveedores (HU-58) y compras (HU-59); las ventas (HU-60) se suman aquí. */
@Module({
  controllers: [TercerosController, ComprasController],
  providers: [
    CasosTercero,
    CasosDocumento,
    { provide: REPOSITORIO_COMERCIAL, useClass: RepositorioComercialPrisma },
  ],
})
export class ComercialModule {}
