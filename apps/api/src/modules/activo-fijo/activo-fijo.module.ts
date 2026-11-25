import { Module } from "@nestjs/common";
import { AdministrarActivos } from "./application/administrar-activos.js";
import { DepreciarActivos } from "./application/depreciar-activos.js";
import { REPOSITORIO_ACTIVO_FIJO } from "./domain/repositorio-activo-fijo.js";
import { DepreciacionController } from "./infrastructure/http/depreciacion.controller.js";
import { ActivosFijosController } from "./infrastructure/http/activos-fijos.controller.js";
import { RepositorioActivoFijoPrisma } from "./infrastructure/repositorio-activo-fijo.prisma.js";

/** Dominio activo fijo: registro, baja y (HU-82) depreciación de los activos con sus partidas (capas domain, application e infrastructure). */
@Module({
  controllers: [ActivosFijosController, DepreciacionController],
  providers: [
    AdministrarActivos,
    DepreciarActivos,
    { provide: REPOSITORIO_ACTIVO_FIJO, useClass: RepositorioActivoFijoPrisma },
  ],
})
export class ActivoFijoModule {}
