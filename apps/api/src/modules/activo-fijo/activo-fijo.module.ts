import { Module } from "@nestjs/common";
import { AdministrarActivos } from "./application/administrar-activos.js";
import { REPOSITORIO_ACTIVO_FIJO } from "./domain/repositorio-activo-fijo.js";
import { ActivosFijosController } from "./infrastructure/http/activos-fijos.controller.js";
import { RepositorioActivoFijoPrisma } from "./infrastructure/repositorio-activo-fijo.prisma.js";

/** Dominio activo fijo: registro, baja y (HU-82) depreciación de los activos con sus partidas (capas domain, application e infrastructure). */
@Module({
  controllers: [ActivosFijosController],
  providers: [
    AdministrarActivos,
    { provide: REPOSITORIO_ACTIVO_FIJO, useClass: RepositorioActivoFijoPrisma },
  ],
})
export class ActivoFijoModule {}
