import { Module } from "@nestjs/common";
import { CasosPagoACuenta } from "./application/casos-pago-a-cuenta.js";
import { CasosLiquidacionIva } from "./application/casos-liquidacion-iva.js";
import { REPOSITORIO_LIQUIDACION_IVA } from "./domain/liquidacion-iva.js";
import { LiquidacionIvaController } from "./infrastructure/http/liquidacion-iva.controller.js";
import { RepositorioLiquidacionIvaPrisma } from "./infrastructure/repositorio-liquidacion-iva.prisma.js";
import { REPOSITORIO_PAGO_A_CUENTA } from "./domain/pago-a-cuenta.js";
import { PagoACuentaController } from "./infrastructure/http/pago-a-cuenta.controller.js";
import { RepositorioPagoACuentaPrisma } from "./infrastructure/repositorio-pago-a-cuenta.prisma.js";

/** Dominio tributario: pago a cuenta y retenciones de renta (HU-49) y liquidación del IVA (HU-48); los libros de IVA van en su propio módulo. */
@Module({
  controllers: [PagoACuentaController, LiquidacionIvaController],
  providers: [
    CasosPagoACuenta,
    CasosLiquidacionIva,
    { provide: REPOSITORIO_LIQUIDACION_IVA, useClass: RepositorioLiquidacionIvaPrisma },
    { provide: REPOSITORIO_PAGO_A_CUENTA, useClass: RepositorioPagoACuentaPrisma },
  ],
})
export class TributarioModule {}
