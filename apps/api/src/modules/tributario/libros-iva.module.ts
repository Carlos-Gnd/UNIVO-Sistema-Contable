import { Module } from "@nestjs/common";
import { ConsultarLibrosIva } from "./application/consultar-libros-iva.js";
import { REPOSITORIO_LIBROS_IVA } from "./domain/repositorio-libros-iva.js";
import { LibrosIvaController } from "./infrastructure/http/libros-iva.controller.js";
import { RepositorioLibrosIvaPrisma } from "./infrastructure/repositorio-libros-iva.prisma.js";

/** Libros de IVA (compras, ventas a contribuyentes y ventas a consumidor final): consultas de solo lectura. */
@Module({
  controllers: [LibrosIvaController],
  providers: [ConsultarLibrosIva, { provide: REPOSITORIO_LIBROS_IVA, useClass: RepositorioLibrosIvaPrisma }],
})
export class LibrosIvaModule {}
