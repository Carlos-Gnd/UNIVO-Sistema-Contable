import { Module } from "@nestjs/common";
import { ConsultarBalanza } from "./application/consultar-balanza.js";
import { ConsultarBalanceGeneral, ConsultarEstadoResultados } from "./application/consultar-estados.js";
import { ConsultarLibroDiario } from "./application/consultar-libro-diario.js";
import { REPOSITORIO_BALANZA } from "./domain/repositorio-balanza.js";
import { REPOSITORIO_DIARIO } from "./domain/repositorio-diario.js";
import { REPOSITORIO_ESTADOS } from "./domain/repositorio-estados.js";
import { BalanzasController } from "./infrastructure/http/balanzas.controller.js";
import { EstadosController } from "./infrastructure/http/estados.controller.js";
import { LibroDiarioController } from "./infrastructure/http/libro-diario.controller.js";
import { RepositorioBalanzaPrisma } from "./infrastructure/repositorio-balanza.prisma.js";
import { RepositorioDiarioPrisma } from "./infrastructure/repositorio-diario.prisma.js";
import { RepositorioEstadosPrisma } from "./infrastructure/repositorio-estados.prisma.js";
import { ConsultarLibroMayor } from "./application/consultar-libro-mayor.js";
import { REPOSITORIO_LIBRO_MAYOR } from "./domain/libro-mayor.js";
import { LibroMayorController } from "./infrastructure/http/libro-mayor.controller.js";
import { RepositorioLibroMayorPrisma } from "./infrastructure/repositorio-libro-mayor.prisma.js";

/** Dominio reportes: libros, balanzas y estados financieros (consultas de solo lectura sobre las partidas). */
@Module({
  controllers: [BalanzasController, EstadosController, LibroDiarioController, LibroMayorController],
  providers: [
    ConsultarBalanza,
    ConsultarEstadoResultados,
    ConsultarBalanceGeneral,
    ConsultarLibroDiario,
    { provide: REPOSITORIO_BALANZA, useClass: RepositorioBalanzaPrisma },
    { provide: REPOSITORIO_ESTADOS, useClass: RepositorioEstadosPrisma },
    { provide: REPOSITORIO_DIARIO, useClass: RepositorioDiarioPrisma },
    ConsultarLibroMayor,
    { provide: REPOSITORIO_LIBRO_MAYOR, useClass: RepositorioLibroMayorPrisma },
  ],
})
export class ReportesModule {}
