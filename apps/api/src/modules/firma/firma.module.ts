import { Module } from "@nestjs/common";
import { CasosFirma } from "./application/casos-firma.js";
import { REPOSITORIO_FIRMA } from "./domain/repositorio-firma.js";
import { EstadosFirmadosController, VerificacionController } from "./infrastructure/http/firma.controller.js";
import { RepositorioFirmaPrisma } from "./infrastructure/repositorio-firma.prisma.js";

/** Firma digital de estados financieros (HU-87) con la autoridad certificadora simulada y su portal de verificación (HU-88). */
@Module({
  controllers: [EstadosFirmadosController, VerificacionController],
  providers: [CasosFirma, { provide: REPOSITORIO_FIRMA, useClass: RepositorioFirmaPrisma }],
})
export class FirmaModule {}
