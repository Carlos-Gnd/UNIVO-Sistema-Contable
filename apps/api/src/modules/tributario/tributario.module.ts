import { Module } from "@nestjs/common";
import { ServicioCalendarioTributario } from "./application/calendario-tributario.js";
import { REPOSITORIO_CALENDARIO } from "./domain/repositorio-calendario.js";
import { CalendarioController } from "./infrastructure/http/calendario.controller.js";
import { RepositorioCalendarioPrisma } from "./infrastructure/repositorio-calendario.prisma.js";

/** Dominio tributario: calendario de vencimientos (HU-52); luego IVA, declaraciones y anexos. */
@Module({
  controllers: [CalendarioController],
  providers: [
    ServicioCalendarioTributario,
    { provide: REPOSITORIO_CALENDARIO, useClass: RepositorioCalendarioPrisma },
  ],
})
export class TributarioModule {}
