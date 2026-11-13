import { Injectable } from "@nestjs/common";
import type { Prisma } from "@contable/db";
import { accionBitacoraSchema, moduloDeTabla, type EntradaBitacora } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type { CriteriosBitacora, RepositorioBitacora } from "../domain/bitacora.js";

const comoObjeto = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

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

  async buscar(c: CriteriosBitacora): Promise<{ registros: EntradaBitacora[]; total: number }> {
    const where: Prisma.BitacoraWhereInput = {
      empresaId: c.empresaId,
      ...(c.usuarioId && { usuarioId: c.usuarioId }),
      ...(c.tablas && { tabla: { in: [...c.tablas] } }),
      ...(c.accion && { accion: c.accion }),
      ...((c.desde || c.antesDe) && {
        creadoEn: { ...(c.desde && { gte: c.desde }), ...(c.antesDe && { lt: c.antesDe }) },
      }),
    };
    // La página y el total en una transacción, para que no se desfasen si entra un cambio entre ambas
    const prisma = this.baseDatos.prisma;
    const [filas, total] = await prisma.$transaction([
      prisma.bitacora.findMany({
        where,
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
        skip: c.saltar,
        take: c.tomar,
      }),
      prisma.bitacora.count({ where }),
    ]);

    const ids = [...new Set(filas.flatMap((f) => (f.usuarioId ? [f.usuarioId] : [])))];
    const usuarios = new Map(
      (
        await prisma.usuario.findMany({
          where: { id: { in: ids } },
          select: { id: true, nombre: true, correo: true },
        })
      ).map((u) => [u.id, u]),
    );

    return {
      total,
      registros: filas.map((f) => ({
        id: f.id.toString(),
        fecha: f.creadoEn.toISOString(),
        usuario: (f.usuarioId && usuarios.get(f.usuarioId)) || null,
        modulo: moduloDeTabla(f.tabla),
        tabla: f.tabla,
        accion: accionBitacoraSchema.parse(f.accion),
        registroId: f.registroId,
        datosAnteriores: comoObjeto(f.datosAnteriores),
        datosNuevos: comoObjeto(f.datosNuevos),
      })),
    };
  }
}
