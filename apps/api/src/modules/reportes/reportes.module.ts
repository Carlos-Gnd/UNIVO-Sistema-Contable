import { Module } from "@nestjs/common";
import { ConsultarBalanza } from "./application/consultar-balanza.js";
import { REPOSITORIO_BALANZA } from "./domain/repositorio-balanza.js";
import { BalanzasController } from "./infrastructure/http/balanzas.controller.js";
import { RepositorioBalanzaPrisma } from "./infrastructure/repositorio-balanza.prisma.js";
import { ConsultarLibroMayor } from "./application/consultar-libro-mayor.js";
import { REPOSITORIO_LIBRO_MAYOR } from "./domain/libro-mayor.js";
import { LibroMayorController } from "./infrastructure/http/libro-mayor.controller.js";
import { RepositorioLibroMayorPrisma } from "./infrastructure/repositorio-libro-mayor.prisma.js";

/** Dominio reportes: libros, balanzas y estados financieros (consultas de solo lectura sobre las partidas). */
@Module({
  controllers: [BalanzasController, LibroMayorController],
  providers: [
    ConsultarBalanza,
    { provide: REPOSITORIO_BALANZA, useClass: RepositorioBalanzaPrisma },
    ConsultarLibroMayor,
    { provide: REPOSITORIO_LIBRO_MAYOR, useClass: RepositorioLibroMayorPrisma },
  ],
})
export class ReportesModule {}
