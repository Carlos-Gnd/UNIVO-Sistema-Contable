import { Module } from "@nestjs/common";
import { CasosTesoreria } from "./application/casos-cuenta-tesoreria.js";
import { REPOSITORIO_TESORERIA } from "./domain/cuenta-tesoreria.js";
import { CuentasTesoreriaController } from "./infrastructure/http/cuentas-tesoreria.controller.js";
import { RepositorioTesoreriaPrisma } from "./infrastructure/repositorio-tesoreria.prisma.js";

/** Dominio tesorería: cajas y cuentas bancarias (HU-76); los movimientos y la conciliación se apoyan en ellas. */
@Module({
  controllers: [CuentasTesoreriaController],
  providers: [CasosTesoreria, { provide: REPOSITORIO_TESORERIA, useClass: RepositorioTesoreriaPrisma }],
})
export class TesoreriaModule {}
