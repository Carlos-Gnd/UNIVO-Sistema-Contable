import { Module } from "@nestjs/common";
import { CasosRespaldos } from "./application/casos-respaldos.js";
import { REPOSITORIO_RESPALDOS } from "./domain/respaldo.js";
import { RespaldosController } from "./infrastructure/http/respaldos.controller.js";
import { RepositorioRespaldosPrisma } from "./infrastructure/repositorio-respaldos.prisma.js";

@Module({
  controllers: [RespaldosController],
  providers: [CasosRespaldos, { provide: REPOSITORIO_RESPALDOS, useClass: RepositorioRespaldosPrisma }],
})
export class RespaldosModule {}
