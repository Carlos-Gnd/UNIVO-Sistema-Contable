import { Module } from "@nestjs/common";
import { ConsultarEmpresa, EditarEmpresaCaso, RegistrarEmpresa } from "./application/casos-empresa.js";
import { REPOSITORIO_EMPRESAS } from "./domain/repositorio-empresas.js";
import { EmpresasController } from "./infrastructure/http/empresas.controller.js";
import { RepositorioEmpresasPrisma } from "./infrastructure/repositorio-empresas.prisma.js";

/** Dominio organización: empresas (HU-06); aquí se sumarán sucursales (HU-07) y usuarios (HU-08). */
@Module({
  controllers: [EmpresasController],
  providers: [
    RegistrarEmpresa,
    ConsultarEmpresa,
    EditarEmpresaCaso,
    { provide: REPOSITORIO_EMPRESAS, useClass: RepositorioEmpresasPrisma },
  ],
})
export class OrganizacionModule {}
