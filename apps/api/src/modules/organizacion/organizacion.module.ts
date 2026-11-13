import { Module } from "@nestjs/common";
import { ConsultarEmpresa, EditarEmpresaCaso, RegistrarEmpresa } from "./application/casos-empresa.js";
import { REPOSITORIO_EMPRESAS } from "./domain/repositorio-empresas.js";
import { EmpresasController } from "./infrastructure/http/empresas.controller.js";
import { RepositorioEmpresasPrisma } from "./infrastructure/repositorio-empresas.prisma.js";
import { LogoController } from "./logo.controller.js";
import { LogoService } from "./logo.service.js";
import { InvitacionController } from "./invitacion.controller.js";
import { InvitacionService } from "./invitacion.service.js";

/**
 * Dominio organización: registro y edición de empresas (HU-06, S1-T38 y S1-T39) y su logotipo
 * (S1-T40); aquí se sumarán sucursales (HU-07) y usuarios (HU-08).
 */
@Module({
  controllers: [EmpresasController, LogoController, InvitacionController],
  providers: [
    RegistrarEmpresa,
    ConsultarEmpresa,
    EditarEmpresaCaso,
    { provide: REPOSITORIO_EMPRESAS, useClass: RepositorioEmpresasPrisma },
    LogoService,
    InvitacionService,
  ],
})
export class OrganizacionModule {}
