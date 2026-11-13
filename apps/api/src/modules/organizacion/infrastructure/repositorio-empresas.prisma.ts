import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type {
  CrearSucursal,
  EditarEmpresa,
  EditarSucursal,
  EmpresaDetalle,
  SucursalDetalle,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { CodigoSucursalDuplicadoError, NitDuplicadoError, ReglaEmpresaError } from "../domain/empresa.js";
import type {
  AccesoSucursales,
  DatosEmpresa,
  RepositorioEmpresas,
  UnidadEmpresas,
  UsuarioSesion,
} from "../domain/repositorio-empresas.js";

type FilaEmpresa = Awaited<ReturnType<Tx["empresa"]["findUniqueOrThrow"]>>;
type FilaSucursal = Awaited<ReturnType<Tx["sucursal"]["findUniqueOrThrow"]>>;

function aSucursal(s: FilaSucursal): SucursalDetalle {
  return {
    id: s.id,
    empresaId: s.empresaId,
    nombre: s.nombre,
    codigoEstablecimiento: s.codigoEstablecimiento,
    codigoPuntoVenta: s.codigoPuntoVenta,
    direccion: s.direccion,
    esMatriz: s.esMatriz,
    activa: s.activa,
    creadoEn: s.creadoEn.toISOString(),
    actualizadoEn: s.actualizadoEn.toISOString(),
  };
}

function aDetalle(e: FilaEmpresa): EmpresaDetalle {
  return {
    id: e.id,
    nombre: e.nombre,
    nombreComercial: e.nombreComercial,
    nit: e.nit,
    nrc: e.nrc,
    tipoContribuyente: e.tipoContribuyente,
    clasificacion: e.clasificacion,
    actividadEconomica: e.actividadEconomica,
    direccion: e.direccion,
    telefono: e.telefono,
    correo: e.correo,
    logoUrl: e.logoUrl,
    modoNumeracion: e.modoNumeracion,
    activa: e.activa,
    creadoEn: e.creadoEn.toISOString(),
    actualizadoEn: e.actualizadoEn.toISOString(),
  };
}

/**
 * Campo de la restricción única que violó la operación (P2002), o null si es otro error. Con el adaptador
 * de pg llega el índice en meta.driverAdapterError.cause.constraint ("empresas_nit_key"); sin adaptador,
 * los campos en meta.target (["nit"]).
 */
export function campoDuplicado(error: unknown): string | null {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return null;
  const detalle = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  for (const campo of ["nit", "correo"]) {
    if (detalle.includes(`_${campo}_key"`) || detalle.includes(`"${campo}"`)) return campo;
  }
  // Índice único de sucursales (empresa, establecimiento, punto de venta); Postgres recorta su nombre
  if (detalle.includes("sucursales_empresa_id_codigo") || detalle.includes('"codigoEstablecimiento"')) {
    return "codigoSucursal";
  }
  return "desconocido";
}

class UnidadPrisma implements UnidadEmpresas {
  constructor(private readonly tx: Tx) {}

  async asegurarUsuario(usuario: UsuarioSesion): Promise<void> {
    if (await this.tx.usuario.findUnique({ where: { id: usuario.id }, select: { id: true } })) return;
    if (!usuario.email) {
      throw new ReglaEmpresaError("Su cuenta no tiene un correo registrado; no se puede crear la empresa.");
    }
    try {
      await this.tx.usuario.create({
        data: { id: usuario.id, correo: usuario.email, nombre: usuario.email.split("@")[0]! },
      });
    } catch (e) {
      if (campoDuplicado(e) === "correo") {
        throw new ReglaEmpresaError(`El correo ${usuario.email} ya pertenece a otro usuario del sistema.`);
      }
      throw e;
    }
  }

  async crear(datos: DatosEmpresa): Promise<EmpresaDetalle> {
    try {
      return aDetalle(await this.tx.empresa.create({ data: datos }));
    } catch (e) {
      if (campoDuplicado(e) === "nit") throw new NitDuplicadoError(datos.nit);
      throw e;
    }
  }

  async asignarAdministrador(usuarioId: string, empresaId: string): Promise<void> {
    const rol = await this.tx.rol.findUniqueOrThrow({ where: { codigo: "administrador" } });
    await this.tx.membresia.create({
      data: { usuarioId, empresaId, rolId: rol.id, todasSucursales: true },
    });
  }

  async obtener(empresaId: string): Promise<EmpresaDetalle | null> {
    const e = await this.tx.empresa.findUnique({ where: { id: empresaId } });
    return e ? aDetalle(e) : null;
  }

  async permisos(usuarioId: string, empresaId: string): Promise<ReadonlySet<string> | null> {
    const filas = await this.tx.$queryRaw<{ permiso: string | null }[]>`
      SELECT pu.permiso
      FROM membresias m
      JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      LEFT JOIN permisos_usuario pu ON pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    if (filas.length === 0) return null;
    return new Set(filas.flatMap((f) => (f.permiso ? [f.permiso] : [])));
  }

  async tienePartidasContabilizadas(empresaId: string): Promise<boolean> {
    const n = await this.tx.partida.count({ where: { empresaId, numero: { not: null } }, take: 1 });
    return n > 0;
  }

  async actualizar(empresaId: string, cambios: EditarEmpresa): Promise<EmpresaDetalle> {
    try {
      return aDetalle(await this.tx.empresa.update({ where: { id: empresaId }, data: cambios }));
    } catch (e) {
      if (campoDuplicado(e) === "nit" && cambios.nit) throw new NitDuplicadoError(cambios.nit);
      throw e;
    }
  }

  async accesoSucursales(usuarioId: string, empresaId: string): Promise<AccesoSucursales> {
    const m = await this.tx.membresia.findUnique({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      select: { todasSucursales: true, sucursales: { select: { sucursalId: true } } },
    });
    return {
      todas: m?.todasSucursales ?? false,
      asignadas: m?.sucursales.map((s) => s.sucursalId) ?? [],
    };
  }

  async listarSucursales(empresaId: string): Promise<SucursalDetalle[]> {
    const filas = await this.tx.sucursal.findMany({
      where: { empresaId },
      orderBy: [{ esMatriz: "desc" }, { codigoEstablecimiento: "asc" }, { codigoPuntoVenta: "asc" }],
    });
    return filas.map(aSucursal);
  }

  async obtenerSucursal(empresaId: string, sucursalId: string): Promise<SucursalDetalle | null> {
    const s = await this.tx.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
    return s ? aSucursal(s) : null;
  }

  async crearSucursal(empresaId: string, datos: CrearSucursal, esMatriz: boolean): Promise<SucursalDetalle> {
    try {
      return aSucursal(await this.tx.sucursal.create({ data: { ...datos, empresaId, esMatriz } }));
    } catch (e) {
      if (campoDuplicado(e) === "codigoSucursal") {
        throw new CodigoSucursalDuplicadoError(datos.codigoEstablecimiento, datos.codigoPuntoVenta);
      }
      throw e;
    }
  }

  async sucursalTieneMovimientos(sucursalId: string): Promise<boolean> {
    return (await this.tx.partida.count({ where: { sucursalId }, take: 1 })) > 0;
  }

  async actualizarSucursal(actual: SucursalDetalle, cambios: EditarSucursal): Promise<SucursalDetalle> {
    try {
      return aSucursal(await this.tx.sucursal.update({ where: { id: actual.id }, data: cambios }));
    } catch (e) {
      if (campoDuplicado(e) === "codigoSucursal") {
        throw new CodigoSucursalDuplicadoError(
          cambios.codigoEstablecimiento ?? actual.codigoEstablecimiento,
          cambios.codigoPuntoVenta ?? actual.codigoPuntoVenta,
        );
      }
      throw e;
    }
  }
}

@Injectable()
export class RepositorioEmpresasPrisma implements RepositorioEmpresas {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEmpresas) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
