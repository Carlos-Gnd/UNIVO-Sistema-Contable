import { Module } from "@nestjs/common";
import { CasosDte } from "./application/casos-dte.js";
import { REPOSITORIO_FACTURACION } from "./domain/repositorio-facturacion.js";
import { DteController } from "./infrastructure/http/dte.controller.js";
import { RepositorioFacturacionPrisma } from "./infrastructure/repositorio-facturacion.prisma.js";

/**
 * Facturación electrónica (EP-08): factura (HU-53), CCF (HU-54), notas de crédito y débito (HU-55), firma, sello
 * simulado y representación gráfica (HU-56) e invalidación (HU-57).
 */
@Module({
  controllers: [DteController],
  providers: [CasosDte, { provide: REPOSITORIO_FACTURACION, useClass: RepositorioFacturacionPrisma }],
})
export class FacturacionModule {}
