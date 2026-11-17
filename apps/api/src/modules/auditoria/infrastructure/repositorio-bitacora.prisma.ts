import { Injectable } from "@nestjs/common";
import { Prisma } from "@contable/db";
import { accionBitacoraSchema, moduloDeTabla, type EntradaBitacora } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import {
  TABLAS_DE_TODA_LA_EMPRESA,
  type AlcanceSucursales,
  type CriteriosBitacora,
  type RepositorioBitacora,
} from "../domain/bitacora.js";

const comoObjeto = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

interface FilaBitacora {
  id: bigint;
  creado_en: Date;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_correo: string | null;
  tabla: string;
  accion: string;
  registro_id: string | null;
  datos_anteriores: unknown;
  datos_nuevos: unknown;
}

/**
 * Condición SQL del límite por sucursal (ver TABLAS_DE_TODA_LA_EMPRESA en el dominio). Lo que no está
 * aquí, como membresías o una tabla nueva, queda oculto para quien está limitado a sus sucursales.
 */
export function condicionSucursales(asignadas: readonly string[]): Prisma.Sql {
  const ids = [...asignadas];
  return Prisma.sql`(
    b.tabla IN (${Prisma.join([...TABLAS_DE_TODA_LA_EMPRESA])})
    OR (b.tabla = 'sucursales' AND b.registro_id = ANY(${ids}::text[]))
    OR (b.tabla = 'partidas' AND (
          b.datos_nuevos ->> 'sucursal_id' = ANY(${ids}::text[])
          OR b.datos_anteriores ->> 'sucursal_id' = ANY(${ids}::text[])))
    OR (b.tabla = 'partida_detalles' AND EXISTS (
          SELECT 1 FROM partidas p
          WHERE p.id::text = coalesce(b.datos_nuevos, b.datos_anteriores) ->> 'partida_id'
            AND p.sucursal_id = ANY(${ids}::uuid[])))
  )`;
}

function condiciones(c: CriteriosBitacora): Prisma.Sql {
  const partes: Prisma.Sql[] = [Prisma.sql`b.empresa_id = ${c.empresaId}::uuid`];
  if (c.usuarioId) partes.push(Prisma.sql`b.usuario_id = ${c.usuarioId}::uuid`);
  if (c.tablas) partes.push(Prisma.sql`b.tabla IN (${Prisma.join([...c.tablas])})`);
  if (c.accion) partes.push(Prisma.sql`b.accion = ${c.accion}`);
  if (c.desde) partes.push(Prisma.sql`b.creado_en >= ${c.desde}`);
  if (c.antesDe) partes.push(Prisma.sql`b.creado_en < ${c.antesDe}`);
  if (c.sucursalesAsignadas) partes.push(condicionSucursales(c.sucursalesAsignadas));
  return Prisma.join(partes, " AND ");
}

@Injectable()
export class RepositorioBitacoraPrisma implements RepositorioBitacora {
  constructor(private readonly baseDatos: BaseDatos) {}

  async permisos(usuarioId: string, empresaId: string): Promise<ReadonlySet<string> | null> {
    const filas = await this.baseDatos.prisma.$queryRaw<{ permiso: string | null }[]>`
      SELECT pu.permiso
      FROM membresias m
      JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      LEFT JOIN permisos_usuario pu ON pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    if (filas.length === 0) return null;
    return new Set(filas.flatMap((f) => (f.permiso ? [f.permiso] : [])));
  }

  async accesoSucursales(usuarioId: string, empresaId: string): Promise<AlcanceSucursales> {
    const m = await this.baseDatos.prisma.membresia.findUnique({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      select: { todasSucursales: true, sucursales: { select: { sucursalId: true } } },
    });
    // Sin membresía no ve ninguna sucursal (el caso de uso ya respondió 404 antes de llegar aquí)
    return { todas: m?.todasSucursales ?? false, asignadas: m?.sucursales.map((s) => s.sucursalId) ?? [] };
  }

  async buscar(c: CriteriosBitacora): Promise<{ registros: EntradaBitacora[]; total: number }> {
    const where = condiciones(c);
    const prisma = this.baseDatos.prisma;
    // La página y el total en una transacción y con la misma condición, para que no se desfasen
    const [filas, conteo] = await prisma.$transaction([
      prisma.$queryRaw<FilaBitacora[]>`
        SELECT b.id, b.creado_en, b.usuario_id::text, u.nombre AS usuario_nombre, u.correo AS usuario_correo,
               b.tabla, b.accion, b.registro_id, b.datos_anteriores, b.datos_nuevos
        FROM bitacora b
        LEFT JOIN usuarios u ON u.id = b.usuario_id
        WHERE ${where}
        ORDER BY b.creado_en DESC, b.id DESC
        OFFSET ${c.saltar} LIMIT ${c.tomar}`,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total FROM bitacora b WHERE ${where}`,
    ]);

    return {
      total: conteo[0]?.total ?? 0,
      registros: filas.map((f) => ({
        id: f.id.toString(),
        fecha: f.creado_en.toISOString(),
        usuario:
          f.usuario_id && f.usuario_nombre && f.usuario_correo
            ? { id: f.usuario_id, nombre: f.usuario_nombre, correo: f.usuario_correo }
            : null,
        modulo: moduloDeTabla(f.tabla),
        tabla: f.tabla,
        accion: accionBitacoraSchema.parse(f.accion),
        registroId: f.registro_id,
        datosAnteriores: comoObjeto(f.datos_anteriores),
        datosNuevos: comoObjeto(f.datos_nuevos),
      })),
    };
  }
}
