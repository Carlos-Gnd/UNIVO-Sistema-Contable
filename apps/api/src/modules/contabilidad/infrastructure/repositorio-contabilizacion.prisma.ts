import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";
import {
  ReglaContableError,
  type AccesoEmpresa,
  type PartidaPorContabilizar,
} from "../domain/contabilizacion.js";
import type {
  RepositorioContabilizacion,
  UnidadContabilizacion,
} from "../domain/repositorio-contabilizacion.js";

/** Códigos de PostgreSQL con los que los triggers rechazan una operación (RAISE EXCEPTION y cuadre). */
const ERRORES_DE_REGLA = new Set(["P0001", "23514"]);

/** Extrae el mensaje de un error lanzado por un trigger contable, o null si es otro tipo de error. */
export function mensajeDeRegla(error: unknown): string | null {
  // Prisma envuelve el error de PostgreSQL: P2010 → meta.driverAdapterError → cause { originalCode, … }
  const siguiente = (e: Record<string, unknown>): unknown =>
    e["cause"] ?? (e["meta"] as { driverAdapterError?: unknown } | undefined)?.driverAdapterError;
  for (let e: unknown = error; e && typeof e === "object"; e = siguiente(e as Record<string, unknown>)) {
    const { code, originalCode, message, originalMessage } = e as Record<string, unknown>;
    const codigo = typeof originalCode === "string" ? originalCode : code;
    if (typeof codigo === "string" && ERRORES_DE_REGLA.has(codigo)) {
      const texto = typeof originalMessage === "string" ? originalMessage : message;
      return typeof texto === "string" ? texto : "La base de datos rechazó la operación.";
    }
  }
  return null;
}

interface FilaPartida {
  id: string;
  sucursal_id: string;
  fecha: string;
  estado: PartidaPorContabilizar["estado"];
}

interface FilaLinea {
  partida_id: string;
  cuenta_id: string;
  debe: string;
  haber: string;
  codigo: string;
  activa: boolean;
  imputable: boolean;
}

class UnidadPrisma implements UnidadContabilizacion {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoEmpresa | null> {
    const [fila] = await this.tx.$queryRaw<
      { todas_sucursales: boolean; puede: boolean; sucursales: string[] }[]
    >`
      SELECT m.todas_sucursales,
             EXISTS (SELECT 1 FROM permisos_usuario pu
                     WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id
                       AND pu.permiso = 'partidas.contabilizar') AS puede,
             ARRAY(SELECT ms.sucursal_id::text FROM membresia_sucursales ms
                   WHERE ms.membresia_id = m.id) AS sucursales
      FROM membresias m
      JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    return fila
      ? { puedeContabilizar: fila.puede, todasSucursales: fila.todas_sucursales, sucursales: fila.sucursales }
      : null;
  }

  async bloquearPartidas(empresaId: string, ids: string[]): Promise<PartidaPorContabilizar[]> {
    // Se bloquean en orden de id para que dos lotes simultáneos no se esperen en círculo
    await this.tx.$queryRaw`
      SELECT id FROM partidas
      WHERE empresa_id = ${empresaId}::uuid AND id = ANY(${ids}::uuid[])
      ORDER BY id FOR UPDATE`;

    const partidas = await this.tx.$queryRaw<FilaPartida[]>`
      SELECT id::text, sucursal_id::text, to_char(fecha, 'YYYY-MM-DD') AS fecha, estado::text
      FROM partidas
      WHERE empresa_id = ${empresaId}::uuid AND id = ANY(${ids}::uuid[])
      ORDER BY fecha, creado_en, id`;
    if (partidas.length === 0) return [];

    const lineas = await this.tx.$queryRaw<FilaLinea[]>`
      SELECT d.partida_id::text, d.cuenta_id::text, d.debe::text, d.haber::text, c.codigo, c.activa,
             NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id) AS imputable
      FROM partida_detalles d
      JOIN cuentas c ON c.id = d.cuenta_id
      WHERE d.partida_id = ANY(${partidas.map((p) => p.id)}::uuid[])
      ORDER BY d.partida_id, d.orden`;

    return partidas.map((p) => {
      const propias = lineas.filter((l) => l.partida_id === p.id);
      return {
        id: p.id,
        sucursalId: p.sucursal_id,
        fecha: p.fecha,
        estado: p.estado,
        lineas: propias.map((l) => ({ cuentaId: l.cuenta_id, debe: l.debe, haber: l.haber })),
        cuentas: propias.map((l) => ({
          id: l.cuenta_id,
          codigo: l.codigo,
          activa: l.activa,
          imputable: l.imputable,
        })),
      };
    });
  }

  async contabilizar(partidaId: string): Promise<{ numero: number; ambito: string }> {
    // Punto de guardado: si la base rechaza esta partida se deshace solo ella y su correlativo
    await this.tx.$executeRaw`SAVEPOINT contabilizar_partida`;
    try {
      const [fila] = await this.tx.$queryRaw<{ numero: number; ambito: string }[]>`
        UPDATE partidas SET estado = 'contabilizada'
        WHERE id = ${partidaId}::uuid
        RETURNING numero, ambito_numeracion AS ambito`;
      await this.tx.$executeRaw`RELEASE SAVEPOINT contabilizar_partida`;
      if (!fila) throw new Error(`La partida ${partidaId} desapareció durante la contabilización`);
      return fila;
    } catch (e) {
      const mensaje = mensajeDeRegla(e);
      if (mensaje === null) throw e;
      await this.tx.$executeRaw`ROLLBACK TO SAVEPOINT contabilizar_partida`;
      throw new ReglaContableError(mensaje);
    }
  }
}

@Injectable()
export class RepositorioContabilizacionPrisma implements RepositorioContabilizacion {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadContabilizacion) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      // El cuadre es una restricción diferida: se adelanta para que falle dentro del punto de guardado
      // de cada partida y no al confirmar todo el lote
      await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      return fn(new UnidadPrisma(tx));
    });
  }
}
