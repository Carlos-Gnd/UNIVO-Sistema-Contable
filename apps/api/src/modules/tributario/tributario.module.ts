import { Module } from "@nestjs/common";
import { CasosPagoACuenta } from "./application/casos-pago-a-cuenta.js";
import { REPOSITORIO_PAGO_A_CUENTA } from "./domain/pago-a-cuenta.js";
import { PagoACuentaController } from "./infrastructure/http/pago-a-cuenta.controller.js";
import { RepositorioPagoACuentaPrisma } from "./infrastructure/repositorio-pago-a-cuenta.prisma.js";

/** Dominio tributario: pago a cuenta y retenciones de renta (HU-49); los libros de IVA se suman en HU-45 a HU-48. */
@Module({
  controllers: [PagoACuentaController],
  providers: [
    CasosPagoACuenta,
    { provide: REPOSITORIO_PAGO_A_CUENTA, useClass: RepositorioPagoACuentaPrisma },
  ],
})
export class TributarioModule {}
