import { Module } from "@nestjs/common";
import { CasosCierreAnual } from "./application/casos-cierre-anual.js";
import { REPOSITORIO_CIERRE_ANUAL } from "./domain/cierre-anual.js";
import { CierreAnualController } from "./infrastructure/http/cierre-anual.controller.js";
import { RepositorioCierreAnualPrisma } from "./infrastructure/repositorio-cierre-anual.prisma.js";

@Module({
  controllers: [CierreAnualController],
  providers: [
    CasosCierreAnual,
    { provide: REPOSITORIO_CIERRE_ANUAL, useClass: RepositorioCierreAnualPrisma },
  ],
})
export class CierreAnualModule {}
