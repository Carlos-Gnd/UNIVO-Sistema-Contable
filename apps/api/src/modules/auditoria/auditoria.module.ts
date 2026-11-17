import { Module } from "@nestjs/common";
import { ConsultarBitacora } from "./application/consultar-bitacora.js";
import { REPOSITORIO_BITACORA } from "./domain/bitacora.js";
import { BitacoraController } from "./infrastructure/http/bitacora.controller.js";
import { RepositorioBitacoraPrisma } from "./infrastructure/repositorio-bitacora.prisma.js";

/** Dominio auditoría: consulta de la bitácora de cambios (HU-11). */
@Module({
  controllers: [BitacoraController],
  providers: [ConsultarBitacora, { provide: REPOSITORIO_BITACORA, useClass: RepositorioBitacoraPrisma }],
})
export class AuditoriaModule {}
