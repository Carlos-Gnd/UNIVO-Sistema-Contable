import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import {
  Dinero,
  type CrearPartida,
  type CuentaInfo,
  type EstadoPartida,
  type PartidaVista,
  type TipoPartida,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { ReglaContableError } from "../domain/contabilizacion.js";
import type {
  AccesoPartidas,
  PartidaExistente,
  RepositorioPartidas,
  UnidadPartidas,
} from "../domain/partida-borrador.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";

/** Ejecuta una escritura y traduce el rechazo de un trigger contable (período cerrado…) a ReglaContableError. */
async function conReglas<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const mensaje = mensajeDeRegla(e);
    if (mensaje === null) throw e;
    throw new ReglaContableError(mensaje);
  }
}

interface FilaPartida {
  id: string;
  sucursal_id: string;
  fecha: string;
  tipo: TipoPartida;
  estado: EstadoPartida;
  numero: number | null;
  concepto: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  origen: string;
  creado_en: Date;
  actualizado_en: Date;
}

interface FilaLinea {
  cuenta_id: string;
  codigo: string;
  nombre: string;
  debe: string;
  haber: string;
  concepto: string | null;
}

class UnidadPrisma implements UnidadPartidas {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoPartidas | null> {
    const [fila] = await this.tx.$queryRaw<
      { todas_sucursales: boolean; permisos: string[]; sucursales: string[] }[]
    >`
      SELECT m.todas_sucursales,
             ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                   WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id) AS permisos,
             ARRAY(SELECT ms.sucursal_id::text FROM membresia_sucursales ms
                   WHERE ms.membresia_id = m.id) AS sucursales
      FROM membresias m
      JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    return fila
      ? {
          permisos: new Set(fila.permisos),
          todasSucursales: fila.todas_sucursales,
          sucursales: fila.sucursales,
        }
      : null;
  }

  async cuentas(empresaId: string, ids: readonly string[]): Promise<CuentaInfo[]> {
    return this.tx.$queryRaw<CuentaInfo[]>`
      SELECT c.id::text, c.codigo, c.activa,
             NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id) AS imputable
      FROM cuentas c
      WHERE c.empresa_id = ${empresaId}::uuid AND c.id = ANY(${[...ids]}::uuid[])`;
  }

  async bloquear(empresaId: string, partidaId: string): Promise<PartidaExistente | null> {
    const [fila] = await this.tx.$queryRaw<{ id: string; sucursal_id: string; estado: EstadoPartida }[]>`
      SELECT id::text, sucursal_id::text, estado::text
      FROM partidas
      WHERE id = ${partidaId}::uuid AND empresa_id = ${empresaId}::uuid
      FOR UPDATE`;
    return fila ? { id: fila.id, sucursalId: fila.sucursal_id, estado: fila.estado } : null;
  }

  crear(empresaId: string, d: CrearPartida): Promise<string> {
    return conReglas(async () => {
      const [fila] = await this.tx.$queryRaw<{ id: string }[]>`
        INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, documento_tipo, documento_numero)
        VALUES (${empresaId}::uuid, ${d.sucursalId}::uuid, ${d.fecha}::date, ${d.tipo}::tipo_partida,
                ${d.concepto ?? null}, ${d.documentoTipo ?? null}, ${d.documentoNumero ?? null})
        RETURNING id::text`;
      if (!fila) throw new Error("La base no devolvió el id de la partida");
      await this.insertarLineas(fila.id, d);
      return fila.id;
    });
  }

  reemplazar(partidaId: string, d: CrearPartida): Promise<void> {
    return conReglas(async () => {
      await this.tx.$executeRaw`
        UPDATE partidas
        SET sucursal_id = ${d.sucursalId}::uuid, fecha = ${d.fecha}::date, tipo = ${d.tipo}::tipo_partida,
            concepto = ${d.concepto ?? null}, documento_tipo = ${d.documentoTipo ?? null},
            documento_numero = ${d.documentoNumero ?? null}
        WHERE id = ${partidaId}::uuid`;
      await this.tx.$executeRaw`DELETE FROM partida_detalles WHERE partida_id = ${partidaId}::uuid`;
      await this.insertarLineas(partidaId, d);
    });
  }

  /** Inserta todas las líneas en una sola sentencia, conservando su orden. */
  private async insertarLineas(partidaId: string, d: CrearPartida): Promise<void> {
    await this.tx.$executeRaw`
      INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, concepto, orden)
      SELECT ${partidaId}::uuid, l.cuenta_id, l.debe, l.haber, l.concepto, (l.n - 1)::smallint
      FROM unnest(${d.lineas.map((l) => l.cuentaId)}::uuid[], ${d.lineas.map((l) => l.debe)}::numeric[],
                  ${d.lineas.map((l) => l.haber)}::numeric[], ${d.lineas.map((l) => l.concepto ?? null)}::text[])
           WITH ORDINALITY AS l(cuenta_id, debe, haber, concepto, n)`;
  }

  async leer(empresaId: string, partidaId: string): Promise<PartidaVista | null> {
    const [p] = await this.tx.$queryRaw<FilaPartida[]>`
      SELECT id::text, sucursal_id::text, to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo::text, estado::text,
             numero, concepto, documento_tipo, documento_numero, origen, creado_en, actualizado_en
      FROM partidas
      WHERE id = ${partidaId}::uuid AND empresa_id = ${empresaId}::uuid`;
    if (!p) return null;

    const filas = await this.tx.$queryRaw<FilaLinea[]>`
      SELECT d.cuenta_id::text, c.codigo, c.nombre, d.debe::text, d.haber::text, d.concepto
      FROM partida_detalles d
      JOIN cuentas c ON c.id = d.cuenta_id
      WHERE d.partida_id = ${partidaId}::uuid
      ORDER BY d.orden, d.id`;
    const lineas = filas.map((l) => ({
      cuentaId: l.cuenta_id,
      codigo: l.codigo,
      nombre: l.nombre,
      debe: l.debe,
      haber: l.haber,
      concepto: l.concepto,
    }));
    // Totales con decimal.js (Dinero), nunca con number
    const debe = Dinero.sumar(lineas.map((l) => l.debe));
    const haber = Dinero.sumar(lineas.map((l) => l.haber));

    return {
      id: p.id,
      sucursalId: p.sucursal_id,
      fecha: p.fecha,
      tipo: p.tipo,
      estado: p.estado,
      numero: p.numero,
      concepto: p.concepto,
      documentoTipo: p.documento_tipo,
      documentoNumero: p.documento_numero,
      origen: p.origen,
      lineas,
      totalDebe: debe.aTexto(),
      totalHaber: haber.aTexto(),
      diferencia: debe.menos(haber).abs().aTexto(),
      cuadra: debe.igualA(haber),
      creadoEn: p.creado_en.toISOString(),
      actualizadoEn: p.actualizado_en.toISOString(),
    };
  }
}

@Injectable()
export class RepositorioPartidasPrisma implements RepositorioPartidas {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadPartidas) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
