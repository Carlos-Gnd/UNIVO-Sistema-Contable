import { Module } from "@nestjs/common";
import { ImportacionExcel } from "./application/importacion-excel.js";
import { LIBROS_EXCEL, REPOSITORIO_IMPORTACION } from "./domain/plantillas.js";
import { LibrosExcelJs } from "./infrastructure/excel.js";
import { ImportacionController } from "./infrastructure/http/importacion.controller.js";
import { RepositorioImportacionPrisma } from "./infrastructure/repositorio-importacion.prisma.js";

/** Importación desde Excel (HU-17): plantillas y lectura con validación (capas domain, application e infrastructure). */
@Module({
  controllers: [ImportacionController],
  providers: [
    ImportacionExcel,
    { provide: REPOSITORIO_IMPORTACION, useClass: RepositorioImportacionPrisma },
    { provide: LIBROS_EXCEL, useClass: LibrosExcelJs },
  ],
})
export class ImportacionModule {}
