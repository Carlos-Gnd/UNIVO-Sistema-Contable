import { Module } from "@nestjs/common";
import { ConsultarTablero } from "./application/consultar-tablero.js";
import { REPOSITORIO_TABLERO } from "./domain/repositorio-tablero.js";
import { TableroController } from "./infrastructure/http/tablero.controller.js";
import { RepositorioTableroPrisma } from "./infrastructure/repositorio-tablero.prisma.js";

@Module({
  controllers: [TableroController],
  providers: [ConsultarTablero, { provide: REPOSITORIO_TABLERO, useClass: RepositorioTableroPrisma }],
})
export class AnaliticaModule {}
