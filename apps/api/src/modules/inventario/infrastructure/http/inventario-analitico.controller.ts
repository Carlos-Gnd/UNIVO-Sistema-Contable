import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import { consultaInventarioAnaliticoSchema, type InventarioAnaliticoVista } from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { ConsultarInventarioAnalitico } from "../../application/consultar-inventario-analitico.js";
import { SucursalNoAutorizadaError, SucursalNoEncontradaError } from "../../domain/producto.js";
import {
  InventarioAnaliticoNoEncontradoError,
  SinSucursalInventarioAnaliticoError,
  SistemaInventarioAnaliticoRequeridoError,
} from "../../domain/inventario-analitico.js";

function aHttp(e: unknown): never {
  if (e instanceof InventarioAnaliticoNoEncontradoError || e instanceof SucursalNoEncontradaError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof SucursalNoAutorizadaError || e instanceof SinSucursalInventarioAnaliticoError) {
    throw new ForbiddenException(e.message);
  }
  if (e instanceof SistemaInventarioAnaliticoRequeridoError) {
    throw new UnprocessableEntityException(e.message);
  }
  throw e;
}

/** Cálculo de costo periódico desde el mayor contabilizado y la toma física final (HU-69). */
@Controller("empresas/:empresaId/inventario-analitico")
export class InventarioAnaliticoController {
  constructor(private readonly consultar: ConsultarInventarioAnalitico) {}

  @Get()
  @Permiso("inventario.ver")
  ejecutar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query() consulta: Record<string, string>,
  ): Promise<InventarioAnaliticoVista> {
    return this.consultar
      .ejecutar(usuario.id, empresaId, validar(consultaInventarioAnaliticoSchema, consulta))
      .catch(aHttp);
  }
}
