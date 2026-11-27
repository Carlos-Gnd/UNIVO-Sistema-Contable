import { Module } from "@nestjs/common";
import {
  ConsultarEmpresa,
  EditarEmpresaCaso,
  ListarEmpresasDisponibles,
  RegistrarEmpresa,
} from "./application/casos-empresa.js";
import { EditarSucursalCaso, ListarSucursales, RegistrarSucursal } from "./application/casos-sucursal.js";
import { REPOSITORIO_EMPRESAS } from "./domain/repositorio-empresas.js";
import { EmpresasController } from "./infrastructure/http/empresas.controller.js";
import { SucursalesController } from "./infrastructure/http/sucursales.controller.js";
import { RepositorioEmpresasPrisma } from "./infrastructure/repositorio-empresas.prisma.js";
import { LogoController } from "./logo.controller.js";
import { LogoService } from "./logo.service.js";
import { InvitacionController } from "./invitacion.controller.js";
import { InvitacionService } from "./invitacion.service.js";
import { AsignarRolUsuario } from "./application/casos-asignacion-usuario.js";
import { ListarUsuariosEmpresa } from "./application/listar-usuarios.js";
import { ConsultarMisPermisos } from "./application/consultar-mis-permisos.js";
import { AsignacionUsuarioController } from "./infrastructure/http/asignacion-usuario.controller.js";
import { ConsultarParametros, EditarParametrosCaso } from "./application/casos-parametros.js";
import { ParametrosController } from "./infrastructure/http/parametros.controller.js";
import { PreferenciaIdiomaController } from "./infrastructure/http/preferencia-idioma.controller.js";
import { PreferenciaIdiomaUsuario } from "./application/preferencia-idioma.js";
import { PreferenciaModoDidacticoController } from "./infrastructure/http/preferencia-modo-didactico.controller.js";
import { PreferenciaModoDidactico } from "./application/preferencia-modo-didactico.js";

/**
 * Dominio organización: registro y edición de empresas (HU-06, S1-T38 y S1-T39), su logotipo
 * (S1-T40), sus sucursales (HU-07, S1-T43 y S1-T44), la invitación de usuarios (HU-08) y los
 * parámetros contables (HU-12, S2-T02).
 */
@Module({
  controllers: [
    EmpresasController,
    ParametrosController,
    SucursalesController,
    LogoController,
    InvitacionController,
    AsignacionUsuarioController,
    PreferenciaIdiomaController,
    PreferenciaModoDidacticoController,
  ],
  providers: [
    RegistrarEmpresa,
    ConsultarEmpresa,
    ListarEmpresasDisponibles,
    EditarEmpresaCaso,
    ConsultarParametros,
    EditarParametrosCaso,
    ListarSucursales,
    RegistrarSucursal,
    EditarSucursalCaso,
    { provide: REPOSITORIO_EMPRESAS, useClass: RepositorioEmpresasPrisma },
    LogoService,
    InvitacionService,
    AsignarRolUsuario,
    ListarUsuariosEmpresa,
    ConsultarMisPermisos,
    PreferenciaIdiomaUsuario,
    PreferenciaModoDidactico,
  ],
})
export class OrganizacionModule {}
