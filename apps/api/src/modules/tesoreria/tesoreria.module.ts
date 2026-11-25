import { Module } from "@nestjs/common";
import { CasosTesoreria } from "./application/casos-cuenta-tesoreria.js";
import { CasosCajaChica } from "./application/casos-caja-chica.js";
import { REPOSITORIO_TESORERIA } from "./domain/cuenta-tesoreria.js";
import { REPOSITORIO_CAJA_CHICA } from "./domain/caja-chica.js";
import { CuentasTesoreriaController } from "./infrastructure/http/cuentas-tesoreria.controller.js";
import { CajaChicaController } from "./infrastructure/http/caja-chica.controller.js";
import { RepositorioTesoreriaPrisma } from "./infrastructure/repositorio-tesoreria.prisma.js";
import { RepositorioCajaChicaPrisma } from "./infrastructure/repositorio-caja-chica.prisma.js";
import { CasosMovimientosBancarios } from "./application/casos-movimientos-bancarios.js";
import { REPOSITORIO_MOVIMIENTO_BANCARIO } from "./domain/movimiento-bancario.js";
import { MovimientosBancariosController } from "./infrastructure/http/movimientos-bancarios.controller.js";
import { RepositorioMovimientosBancariosPrisma } from "./infrastructure/repositorio-movimientos-bancarios.prisma.js";
import { CasosConciliacionBancaria } from "./application/casos-conciliacion-bancaria.js";
import { REPOSITORIO_CONCILIACION } from "./domain/conciliacion-bancaria.js";
import { ConciliacionBancariaController } from "./infrastructure/http/conciliacion-bancaria.controller.js";
import { RepositorioConciliacionBancariaPrisma } from "./infrastructure/repositorio-conciliacion-bancaria.prisma.js";

/** Dominio tesorería: cajas y cuentas bancarias (HU-76); los movimientos y la conciliación se apoyan en ellas. */
@Module({
  controllers: [
    CuentasTesoreriaController,
    CajaChicaController,
    MovimientosBancariosController,
    ConciliacionBancariaController,
  ],
  providers: [
    CasosTesoreria,
    { provide: REPOSITORIO_TESORERIA, useClass: RepositorioTesoreriaPrisma },
    CasosCajaChica,
    { provide: REPOSITORIO_CAJA_CHICA, useClass: RepositorioCajaChicaPrisma },
    CasosMovimientosBancarios,
    { provide: REPOSITORIO_MOVIMIENTO_BANCARIO, useClass: RepositorioMovimientosBancariosPrisma },
    CasosConciliacionBancaria,
    { provide: REPOSITORIO_CONCILIACION, useClass: RepositorioConciliacionBancariaPrisma },
  ],
})
export class TesoreriaModule {}
