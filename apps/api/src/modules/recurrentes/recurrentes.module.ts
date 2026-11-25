import { Module } from "@nestjs/common";
import { CasosRecurrentes } from "./application/casos-recurrentes.js";
import { REPOSITORIO_RECURRENTES } from "./domain/recurrentes.js";
import { RecurrentesController } from "./infrastructure/http/recurrentes.controller.js";
import { RepositorioRecurrentesPrisma } from "./infrastructure/repositorio-recurrentes.prisma.js";

/** Dominio recurrentes: plantillas de partidas que se repiten cada mes (HU-26). */
@Module({
  controllers: [RecurrentesController],
  providers: [CasosRecurrentes, { provide: REPOSITORIO_RECURRENTES, useClass: RepositorioRecurrentesPrisma }],
})
export class RecurrentesModule {}
