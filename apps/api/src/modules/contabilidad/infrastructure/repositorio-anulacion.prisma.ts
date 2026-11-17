import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { EstadoPartida, TipoPartida } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import type { DatosReversion, NumeroAsignado, PartidaAnulable } from "../domain/anulacion.js";
import { ReglaContableError } from "../domain/contabilizacion.js";
import type { AccesoPartidas } from "../domain/partida-borrador.js";
import type { RepositorioAnulacion, UnidadAnulacion } from "../domain/repositorio-anulacion.js";

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
  estado: EstadoPartida;
  tipo: TipoPartida;
  numero: number | null;
  ambito: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
}

class UnidadPrisma implements UnidadAnulacion {
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

  async bloquear(empresaId: string, partidaId: string): Promise<PartidaAnulable | null> {
    const [p] = await this.tx.$queryRaw<FilaPartida[]>`
      SELECT id::text, sucursal_id::text, to_char(fecha, 'YYYY-MM-DD') AS fecha, estado::text, tipo::text,
             numero, ambito_numeracion AS ambito, documento_tipo, documento_numero
      FROM partidas
      WHERE id = ${partidaId}::uuid AND empresa_id = ${empresaId}::uuid
      FOR UPDATE`;
    if (!p) return null;

    const lineas = await this.tx.$queryRaw<
      { cuenta_id: string; debe: string; haber: string; concepto: string | null }[]
    >`
      SELECT cuenta_id::text, debe::text, haber::text, concepto
      FROM partida_detalles
      WHERE partida_id = ${partidaId}::uuid
      ORDER BY orden, id`;
    return {
      id: p.id,
      sucursalId: p.sucursal_id,
      fecha: p.fecha,
      estado: p.estado,
      tipo: p.tipo,
      numero: p.numero,
      ambito: p.ambito,
      documentoTipo: p.documento_tipo,
      documentoNumero: p.documento_numero,
      lineas: lineas.map((l) => ({
        cuentaId: l.cuenta_id,
        debe: l.debe,
        haber: l.haber,
        concepto: l.concepto,
      })),
    };
  }

  crearReversion(empresaId: string, d: DatosReversion): Promise<string> {
    return conReglas(async () => {
      const [fila] = await this.tx.$queryRaw<{ id: string }[]>`
        INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, documento_tipo, documento_numero,
                              origen, partida_revertida_id)
        VALUES (${empresaId}::uuid, ${d.sucursalId}::uuid, ${d.fecha}::date, 'reversion'::tipo_partida,
                ${d.concepto}, ${d.documentoTipo}, ${d.documentoNumero}, 'anulacion',
                ${d.partidaRevertidaId}::uuid)
        RETURNING id::text`;
      if (!fila) throw new Error("La base no devolvió el id de la reversión");
      await this.tx.$executeRaw`
        INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, concepto, orden)
        SELECT ${fila.id}::uuid, l.cuenta_id, l.debe, l.haber, l.concepto, (l.n - 1)::smallint
        FROM unnest(${d.lineas.map((l) => l.cuentaId)}::uuid[], ${d.lineas.map((l) => l.debe)}::numeric[],
                    ${d.lineas.map((l) => l.haber)}::numeric[], ${d.lineas.map((l) => l.concepto)}::text[])
             WITH ORDINALITY AS l(cuenta_id, debe, haber, concepto, n)`;
      return fila.id;
    });
  }

  contabilizar(partidaId: string): Promise<NumeroAsignado> {
    return conReglas(async () => {
      const [fila] = await this.tx.$queryRaw<{ numero: number; ambito: string }[]>`
        UPDATE partidas SET estado = 'contabilizada'
        WHERE id = ${partidaId}::uuid
        RETURNING numero, ambito_numeracion AS ambito`;
      if (!fila) throw new Error(`La reversión ${partidaId} desapareció durante la anulación`);
      return fila;
    });
  }

  anular(partidaId: string, motivo: string): Promise<void> {
    return conReglas(async () => {
      await this.tx.$executeRaw`
        UPDATE partidas SET estado = 'anulada', motivo_anulacion = ${motivo}
        WHERE id = ${partidaId}::uuid`;
    });
  }
}

@Injectable()
export class RepositorioAnulacionPrisma implements RepositorioAnulacion {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadAnulacion) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      // El cuadre es una restricción diferida: se adelanta para que falle dentro de la transacción
      // y con un mensaje claro, no al confirmarla
      await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
      return fn(new UnidadPrisma(tx));
    });
  }
}
