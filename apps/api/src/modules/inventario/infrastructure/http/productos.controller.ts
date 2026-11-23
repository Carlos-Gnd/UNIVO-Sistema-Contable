import {
  Body,
  ConflictException,
  Controller,
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
  type CategoriaProducto,
  type ProductoVista,
} from "@contable/shared";
import { Permiso } from "../../../../compartido/permiso.decorator.js";
import { UsuarioActual, type Usuario } from "../../../../compartido/usuario-actual.js";
import { validar } from "../../../../compartido/validacion.js";
import { CasosInventario } from "../../application/casos-producto.js";
import {
  CategoriaDuplicadaError,
  CategoriaNoEncontradaError,
  CodigoProductoDuplicadoError,
  ProductoNoEncontradoError,
  ReglaProductoError,
} from "../../domain/producto.js";

const PERMISO_VER = "inventario.ver";
const PERMISO_REGISTRAR = "inventario.registrar";

/** Traduce los errores del dominio de inventario a respuestas HTTP. */
function aHttp(e: unknown): never {
  if (e instanceof ProductoNoEncontradoError || e instanceof CategoriaNoEncontradaError) {
    throw new NotFoundException(e.message);
  }
  if (e instanceof CodigoProductoDuplicadoError || e instanceof CategoriaDuplicadaError) {
    throw new ConflictException(e.message);
  }
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
  constructor(private readonly casos: CasosInventario) {}

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

  @Get(":productoId")
  @Permiso(PERMISO_VER)
  uno(
    @UsuarioActual() usuario: Usuario,
    @Param("empresaId", ParseUUIDPipe) empresaId: string,
    @Param("productoId", ParseUUIDPipe) productoId: string,
  ): Promise<ProductoVista> {
    return this.casos.producto(usuario.id, empresaId, productoId).catch(aHttp);
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
