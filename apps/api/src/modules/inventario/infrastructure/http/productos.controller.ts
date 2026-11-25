import {
  Body,
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
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  crearCategoriaSchema,
  crearProductoSchema,
  editarCategoriaSchema,
  editarProductoSchema,
  idSchema,
  consultaKardexSchema,
  consultaSeriesSchema,
  crearMovimientoSchema,
  type CategoriaProducto,
  type KardexVista,
  type MovimientoInventarioVista,
  type ProductoVista,
  type SerieInventarioVista,
  type ProductoReabastecimientoVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosKardex } from "../../application/casos-kardex.js";
import { CasosInventario } from "../../application/casos-producto.js";
import {
  CategoriaDuplicadaError,
  CategoriaNoEncontradaError,
  CodigoProductoDuplicadoError,
  ProductoNoEncontradoError,
  ReglaProductoError,
  SerieDuplicadaError,
  SucursalNoAutorizadaError,
  SucursalNoEncontradaError,
} from "../../domain/producto.js";

const PERMISO_VER = "inventario.ver";
const PERMISO_REGISTRAR = "inventario.registrar";

/** Traduce los errores del dominio de inventario a respuestas HTTP. */
function aHttp(e: unknown): never {
  if (
    e instanceof ProductoNoEncontradoError ||
    e instanceof CategoriaNoEncontradaError ||
    e instanceof SucursalNoEncontradaError
  ) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof CodigoProductoDuplicadoError || e instanceof CategoriaDuplicadaError) {
    throw new ConflictException(e.message);
  }
  if (e instanceof SerieDuplicadaError) throw new ConflictException(e.message);
  if (e instanceof SucursalNoAutorizadaError) throw new ForbiddenException(e.message);
  if (e instanceof ReglaProductoError) throw new UnprocessableEntityException(e.message);
  throw e;
}

/** Categorías de producto de una empresa (HU-64, S3-T76). No hay DELETE: una categoría se inactiva. */
@Controller("empresas/:empresaId/categorias-producto")
export class CategoriasProductoController {
  constructor(private readonly casos: CasosInventario) {}

  @Get()
  @Permiso(PERMISO_VER)
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
  ): Promise<CategoriaProducto[]> {
    return this.casos.categorias(usuario.id, empresaId).catch(aHttp);
  }

  @Post()
  @Permiso(PERMISO_REGISTRAR)
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<CategoriaProducto> {
    return this.casos
      .crearCategoria(usuario.id, empresaId, validar(crearCategoriaSchema, cuerpo))
      .catch(aHttp);
  }

  @Patch(":categoriaId")
  @Permiso(PERMISO_REGISTRAR)
  editar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("categoriaId", ParseUUIDPipe) categoriaId: string,
    @Body() cuerpo: unknown,
  ): Promise<CategoriaProducto> {
    return this.casos
      .editarCategoria(usuario.id, empresaId, categoriaId, validar(editarCategoriaSchema, cuerpo))
      .catch(aHttp);
  }
}

/** Productos de una empresa (HU-64, S3-T76). No hay DELETE: un producto se inactiva y conserva su historial. */
@Controller("empresas/:empresaId/productos")
export class ProductosController {
  constructor(
    private readonly casos: CasosInventario,
    private readonly kardex: CasosKardex,
  ) {}

  /** Filtros opcionales: ?categoriaId, ?busqueda (código o nombre) y ?activo=true|false. */
  @Get()
  @Permiso(PERMISO_VER)
  lista(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query("categoriaId") categoriaId?: string,
    @Query("busqueda") busqueda?: string,
    @Query("activo") activo?: string,
  ): Promise<ProductoVista[]> {
    const filtro = {
      ...(categoriaId ? { categoriaId: validar(idSchema, categoriaId) } : {}),
      ...(busqueda ? { busqueda } : {}),
      ...(activo === "true" ? { activo: true } : activo === "false" ? { activo: false } : {}),
    };
    return this.casos.productos(usuario.id, empresaId, filtro).catch(aHttp);
  }

  /** Productos que llegaron o bajaron de su punto de reorden en una sucursal. */
  @Get("reabastecimiento")
  @Permiso(PERMISO_VER)
  reabastecimiento(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Query("sucursalId") sucursalId: string,
  ): Promise<ProductoReabastecimientoVista[]> {
    return this.kardex
      .consultarReabastecimiento(usuario.id, empresaId, validar(idSchema, sucursalId))
      .catch(aHttp);
  }

  /** Kardex del producto en una sucursal: ?sucursalId (obligatorio), ?desde y ?hasta (AAAA-MM-DD). */
  @Get(":productoId/kardex")
  @Permiso(PERMISO_VER)
  verKardex(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("productoId", ParseUUIDPipe) productoId: string,
    @Query() consulta: Record<string, string>,
  ): Promise<KardexVista> {
    return this.kardex
      .consultar(usuario.id, empresaId, productoId, validar(consultaKardexSchema, consulta))
      .catch(aHttp);
  }

  @Get(":productoId")
  @Permiso(PERMISO_VER)
  uno(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("productoId", ParseUUIDPipe) productoId: string,
  ): Promise<ProductoVista> {
    return this.casos.producto(usuario.id, empresaId, productoId).catch(aHttp);
  }

  @Get(":productoId/series")
  @Permiso(PERMISO_VER)
  verSeries(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("productoId", ParseUUIDPipe) productoId: string,
    @Query() consulta: Record<string, string>,
  ): Promise<SerieInventarioVista[]> {
    return this.kardex
      .consultarSeries(usuario.id, empresaId, productoId, validar(consultaSeriesSchema, consulta))
      .catch(aHttp);
  }

  @Post()
  @Permiso(PERMISO_REGISTRAR)
  crear(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ProductoVista> {
    return this.casos.crearProducto(usuario.id, empresaId, validar(crearProductoSchema, cuerpo)).catch(aHttp);
  }

  /** Edita los campos enviados; { "activo": false } inactiva el producto y { "categoriaId": null } quita su categoría. */
  @Patch(":productoId")
  @Permiso(PERMISO_REGISTRAR)
  editar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("productoId", ParseUUIDPipe) productoId: string,
    @Body() cuerpo: unknown,
  ): Promise<ProductoVista> {
    return this.casos
      .editarProducto(usuario.id, empresaId, productoId, validar(editarProductoSchema, cuerpo))
      .catch(aHttp);
  }
}

/** Entradas y salidas de inventario (HU-65): el costo de las salidas lo calcula el sistema. */
@Controller("empresas/:empresaId/movimientos-inventario")
export class MovimientosInventarioController {
  constructor(private readonly kardex: CasosKardex) {}

  @Post()
  @Permiso(PERMISO_REGISTRAR)
  registrar(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Body() cuerpo: unknown,
  ): Promise<MovimientoInventarioVista> {
    return this.kardex.registrar(usuario.id, empresaId, validar(crearMovimientoSchema, cuerpo)).catch(aHttp);
  }
}
