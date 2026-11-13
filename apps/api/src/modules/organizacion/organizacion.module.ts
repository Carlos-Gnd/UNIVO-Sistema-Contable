import { Module } from "@nestjs/common";
import { ConsultarEmpresa, EditarEmpresaCaso, RegistrarEmpresa } from "./application/casos-empresa.js";
import { EditarSucursalCaso, ListarSucursales, RegistrarSucursal } from "./application/casos-sucursal.js";
import { REPOSITORIO_EMPRESAS } from "./domain/repositorio-empresas.js";
import { EmpresasController } from "./infrastructure/http/empresas.controller.js";
import { SucursalesController } from "./infrastructure/http/sucursales.controller.js";
import { RepositorioEmpresasPrisma } from "./infrastructure/repositorio-empresas.prisma.js";
import { LogoController } from "./logo.controller.js";
import { LogoService } from "./logo.service.js";

/**
 * Dominio organización: registro y edición de empresas (HU-06, S1-T38 y S1-T39), su logotipo
 * (S1-T40) y sus sucursales (HU-07, S1-T43 y S1-T44); aquí se sumarán los usuarios (HU-08).
 */
@Module({
  controllers: [EmpresasController, SucursalesController, LogoController],
  providers: [
    RegistrarEmpresa,
    ConsultarEmpresa,
    EditarEmpresaCaso,
    ListarSucursales,
    RegistrarSucursal,
    EditarSucursalCaso,
    { provide: REPOSITORIO_EMPRESAS, useClass: RepositorioEmpresasPrisma },
    LogoService,
  ],
})
export class OrganizacionModule {}
