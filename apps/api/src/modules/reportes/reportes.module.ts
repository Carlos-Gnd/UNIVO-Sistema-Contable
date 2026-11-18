import { Module } from "@nestjs/common";
import { ConsultarBalanza } from "./application/consultar-balanza.js";
import { ConsultarBalanceGeneral, ConsultarEstadoResultados } from "./application/consultar-estados.js";
import { REPOSITORIO_BALANZA } from "./domain/repositorio-balanza.js";
import { REPOSITORIO_ESTADOS } from "./domain/repositorio-estados.js";
import { BalanzasController } from "./infrastructure/http/balanzas.controller.js";
import { EstadosController } from "./infrastructure/http/estados.controller.js";
import { RepositorioBalanzaPrisma } from "./infrastructure/repositorio-balanza.prisma.js";
import { RepositorioEstadosPrisma } from "./infrastructure/repositorio-estados.prisma.js";

/** Dominio reportes: libros, balanzas y estados financieros (consultas de solo lectura sobre las partidas). */
@Module({
  controllers: [BalanzasController, EstadosController],
  providers: [
    ConsultarBalanza,
    ConsultarEstadoResultados,
    ConsultarBalanceGeneral,
    { provide: REPOSITORIO_BALANZA, useClass: RepositorioBalanzaPrisma },
    { provide: REPOSITORIO_ESTADOS, useClass: RepositorioEstadosPrisma },
  ],
})
export class ReportesModule {}
