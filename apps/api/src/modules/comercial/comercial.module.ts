import { Module } from "@nestjs/common";
import { CasosAntiguedad } from "./application/casos-antiguedad.js";
import { CasosDocumento } from "./application/casos-documento.js";
import { CasosAbono } from "./application/casos-abono.js";
import { CasosNota } from "./application/casos-nota.js";
import { ImportarTerceros } from "./application/importar-terceros.js";
import { CasosTercero } from "./application/casos-tercero.js";
import { REPOSITORIO_COMERCIAL } from "./domain/tercero.js";
import { AntiguedadController } from "./infrastructure/http/antiguedad.controller.js";
import { AbonosController } from "./infrastructure/http/abonos.controller.js";
import { ComprasController } from "./infrastructure/http/compras.controller.js";
import { NotasController } from "./infrastructure/http/notas.controller.js";
import { VentasController } from "./infrastructure/http/ventas.controller.js";
import { ImportarTercerosController } from "./infrastructure/http/importar-terceros.controller.js";
import { TercerosController } from "./infrastructure/http/terceros.controller.js";
import { RepositorioComercialPrisma } from "./infrastructure/repositorio-comercial.prisma.js";

/** Dominio comercial: clientes y proveedores (HU-58) compras (HU-59), ventas (HU-60) y notas de crédito y débito (HU-61) y abonos de cuentas por cobrar y por pagar (HU-62). */
@Module({
  controllers: [
    TercerosController,
    ImportarTercerosController,
    ComprasController,
    VentasController,
    NotasController,
    AbonosController,
    AntiguedadController,
  ],
  providers: [
    CasosTercero,
    ImportarTerceros,
    CasosDocumento,
    CasosNota,
    CasosAbono,
    CasosAntiguedad,
    { provide: REPOSITORIO_COMERCIAL, useClass: RepositorioComercialPrisma },
  ],
})
export class ComercialModule {}
