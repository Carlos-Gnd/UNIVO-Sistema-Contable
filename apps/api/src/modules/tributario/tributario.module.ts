import { Module } from "@nestjs/common";
import { ServicioCalendarioTributario } from "./application/calendario-tributario.js";
import { CasosPagoACuenta } from "./application/casos-pago-a-cuenta.js";
import { CasosLiquidacionIva } from "./application/casos-liquidacion-iva.js";
import { REPOSITORIO_CALENDARIO } from "./domain/repositorio-calendario.js";
import { REPOSITORIO_LIQUIDACION_IVA } from "./domain/liquidacion-iva.js";
import { CalendarioController } from "./infrastructure/http/calendario.controller.js";
import {
  LiquidacionIvaController,
  RetencionPercepcionController,
} from "./infrastructure/http/liquidacion-iva.controller.js";
import { RepositorioCalendarioPrisma } from "./infrastructure/repositorio-calendario.prisma.js";
import { RepositorioLiquidacionIvaPrisma } from "./infrastructure/repositorio-liquidacion-iva.prisma.js";
import { REPOSITORIO_PAGO_A_CUENTA } from "./domain/pago-a-cuenta.js";
import { PagoACuentaController } from "./infrastructure/http/pago-a-cuenta.controller.js";
import { RepositorioPagoACuentaPrisma } from "./infrastructure/repositorio-pago-a-cuenta.prisma.js";

/** Dominio tributario: calendario de vencimientos (HU-52), pago a cuenta y retenciones de renta (HU-49) y liquidación del IVA (HU-48); los libros de IVA van en su propio módulo. */
@Module({
  controllers: [
    CalendarioController,
    PagoACuentaController,
    LiquidacionIvaController,
    RetencionPercepcionController,
  ],
  providers: [
    ServicioCalendarioTributario,
    CasosPagoACuenta,
    CasosLiquidacionIva,
    { provide: REPOSITORIO_CALENDARIO, useClass: RepositorioCalendarioPrisma },
    { provide: REPOSITORIO_LIQUIDACION_IVA, useClass: RepositorioLiquidacionIvaPrisma },
    { provide: REPOSITORIO_PAGO_A_CUENTA, useClass: RepositorioPagoACuentaPrisma },
  ],
})
export class TributarioModule {}
