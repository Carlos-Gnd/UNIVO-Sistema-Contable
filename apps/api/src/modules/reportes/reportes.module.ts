import { Module } from "@nestjs/common";
import { ConsultarBalanza } from "./application/consultar-balanza.js";
import { REPOSITORIO_BALANZA } from "./domain/repositorio-balanza.js";
import { BalanzasController } from "./infrastructure/http/balanzas.controller.js";
import { RepositorioBalanzaPrisma } from "./infrastructure/repositorio-balanza.prisma.js";

/** Dominio reportes: libros, balanzas y estados financieros (consultas de solo lectura sobre las partidas). */
@Module({
  controllers: [BalanzasController],
  providers: [ConsultarBalanza, { provide: REPOSITORIO_BALANZA, useClass: RepositorioBalanzaPrisma }],
})
export class ReportesModule {}
