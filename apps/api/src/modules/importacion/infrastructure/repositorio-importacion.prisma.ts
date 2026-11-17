import { Injectable } from "@nestjs/common";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type { CuentaExistente, RepositorioImportacion } from "../domain/plantillas.js";

@Injectable()
export class RepositorioImportacionPrisma implements RepositorioImportacion {
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

  cuentas(empresaId: string): Promise<CuentaExistente[]> {
    return this.baseDatos.prisma.$queryRaw<CuentaExistente[]>`
      SELECT c.id::text, c.codigo, c.nombre, c.naturaleza::text AS naturaleza, c.activa,
             NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id) AS imputable,
             EXISTS (SELECT 1 FROM partida_detalles d WHERE d.cuenta_id = c.id) AS "tieneMovimientos"
      FROM cuentas c
      WHERE c.empresa_id = ${empresaId}::uuid
      ORDER BY c.codigo`;
  }
}
