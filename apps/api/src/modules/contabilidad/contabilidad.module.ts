import { Module } from "@nestjs/common";
import { AdministrarEjercicios } from "./application/administrar-ejercicios.js";
import { ContabilizarPartidas } from "./application/contabilizar-partidas.js";
import { PartidasBorrador } from "./application/partidas-borrador.js";
import { REPOSITORIO_PARTIDAS } from "./domain/partida-borrador.js";
import { REPOSITORIO_CONTABILIZACION } from "./domain/repositorio-contabilizacion.js";
import { ContabilizacionController } from "./infrastructure/http/contabilizacion.controller.js";
import { EjerciciosController } from "./infrastructure/http/ejercicios.controller.js";
import { PartidasController } from "./infrastructure/http/partidas.controller.js";
import { RepositorioContabilizacionPrisma } from "./infrastructure/repositorio-contabilizacion.prisma.js";
import { RepositorioPartidasPrisma } from "./infrastructure/repositorio-partidas.prisma.js";

/** Dominio contabilidad: partidas, ejercicios y su contabilización (capas domain, application e infrastructure). */
@Module({
  controllers: [ContabilizacionController, PartidasController, EjerciciosController],
  providers: [
    ContabilizarPartidas,
    PartidasBorrador,
    AdministrarEjercicios,
    { provide: REPOSITORIO_CONTABILIZACION, useClass: RepositorioContabilizacionPrisma },
    { provide: REPOSITORIO_PARTIDAS, useClass: RepositorioPartidasPrisma },
  ],
})
export class ContabilidadModule {}
