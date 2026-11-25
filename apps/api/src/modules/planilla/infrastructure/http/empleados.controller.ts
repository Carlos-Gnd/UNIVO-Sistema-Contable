import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Body,
  UnprocessableEntityException,
} from "@nestjs/common";
import { crearEmpleadoSchema, editarEmpleadoSchema, type EmpleadoVista } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { mensajeDeRegla } from "../../../../compartido/mensaje-regla-db.js";
import { CasosEmpleados } from "../../application/casos-empleados.js";
import {
  EmpleadoDuplicadoError,
  EmpleadoNoEncontradoError,
  EmpresaPlanillaNoEncontradaError,
  ReglaEmpleadoError,
  SucursalEmpleadoNoAutorizadaError,
  SucursalEmpleadoNoEncontradaError,
} from "../../domain/empleado.js";

function aHttp(error: unknown): never {
  if (error instanceof EmpleadoNoEncontradoError || error instanceof EmpresaPlanillaNoEncontradaError) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof SucursalEmpleadoNoEncontradaError) throw new NotFoundException(error.message);
  if (error instanceof SucursalEmpleadoNoAutorizadaError) throw new ForbiddenException(error.message);
  if (error instanceof EmpleadoDuplicadoError) throw new ConflictException(error.message);
  if (error instanceof ReglaEmpleadoError) throw new UnprocessableEntityException(error.message);
  const regla = mensajeDeRegla(error);
  if (regla) throw new UnprocessableEntityException(regla);
  throw error;
}

@Controller("empresas/:empresaId/empleados")
export class EmpleadosController {
  constructor(private readonly casos: CasosEmpleados) {}

  @Get()
  @Permiso("planilla.ver")
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query("activo") activo?: string,
  ): Promise<EmpleadoVista[]> {
    const filtro = activo === "true" ? { activo: true } : activo === "false" ? { activo: false } : {};
    return this.casos.empleados(usuario.id, empresaId, filtro).catch(aHttp);
  }

  @Get(":empleadoId")
  @Permiso("planilla.ver")
  uno(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("empleadoId", ParseUUIDPipe) empleadoId: string,
  ): Promise<EmpleadoVista> {
    return this.casos.empleado(usuario.id, empresaId, empleadoId).catch(aHttp);
  }

  @Post()
  @Permiso("planilla.calcular")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<EmpleadoVista> {
    return this.casos.crearEmpleado(usuario.id, empresaId, validar(crearEmpleadoSchema, cuerpo)).catch(aHttp);
  }

  @Patch(":empleadoId")
  @Permiso("planilla.calcular")
  editar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("empleadoId", ParseUUIDPipe) empleadoId: string,
    @Body() cuerpo: unknown,
  ): Promise<EmpleadoVista> {
    return this.casos
      .editarEmpleado(usuario.id, empresaId, empleadoId, validar(editarEmpleadoSchema, cuerpo))
      .catch(aHttp);
  }
}
