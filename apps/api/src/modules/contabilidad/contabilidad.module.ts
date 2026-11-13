import { Module } from "@nestjs/common";
import { ContabilizarPartidas } from "./application/contabilizar-partidas.js";
import { REPOSITORIO_CONTABILIZACION } from "./domain/repositorio-contabilizacion.js";
import { ContabilizacionController } from "./infrastructure/http/contabilizacion.controller.js";
import { RepositorioContabilizacionPrisma } from "./infrastructure/repositorio-contabilizacion.prisma.js";
import { AdministrarCuentas } from "./application/administrar-cuentas.js";
import { CuentasController } from "./infrastructure/http/cuentas.controller.js";

/** Dominio contabilidad: partidas y su contabilización (capas domain, application e infrastructure). */
@Module({
  controllers: [ContabilizacionController, CuentasController],
  providers: [
    ContabilizarPartidas,
    AdministrarCuentas,
    { provide: REPOSITORIO_CONTABILIZACION, useClass: RepositorioContabilizacionPrisma },
  ],
})
export class ContabilidadModule {}
