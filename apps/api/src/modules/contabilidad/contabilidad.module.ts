import { Module } from "@nestjs/common";
import { ContabilizarPartidas } from "./application/contabilizar-partidas.js";
import { REPOSITORIO_CONTABILIZACION } from "./domain/repositorio-contabilizacion.js";
import { ContabilizacionController } from "./infrastructure/http/contabilizacion.controller.js";
import { RepositorioContabilizacionPrisma } from "./infrastructure/repositorio-contabilizacion.prisma.js";
import { AdministrarEjercicios } from "./application/administrar-ejercicios.js";
import { EjerciciosController } from "./infrastructure/http/ejercicios.controller.js";

/** Dominio contabilidad: partidas y su contabilización (capas domain, application e infrastructure). */
@Module({
  controllers: [ContabilizacionController, EjerciciosController],
  providers: [
    ContabilizarPartidas,
    AdministrarEjercicios,
    { provide: REPOSITORIO_CONTABILIZACION, useClass: RepositorioContabilizacionPrisma },
  ],
})
export class ContabilidadModule {}
