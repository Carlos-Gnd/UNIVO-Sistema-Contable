import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import {
  Dinero,
  type CrearPartida,
  type CuentaInfo,
  type EstadoPartida,
  type PartidaVista,
  type PartidaVersionVista,
  type TipoPartida,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { ReglaContableError } from "../domain/contabilizacion.js";
import type {
  AccesoPartidas,
  PartidaExistente,
  RepositorioPartidas,
  UnidadPartidas,
  OrigenPartida,
} from "../domain/partida-borrador.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import { explicarPartidaDidactica } from "../domain/explicacion-didactica.js";

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

interface FilaLineaBorrador extends FilaLinea {
  partida_id: string;
}

interface DatosVersion {
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
  creado_en: string;
  actualizado_en: string;
}

interface LineaVersion {
  cuenta_id: string;
  codigo: string;
  nombre: string;
  debe: string;
  haber: string;
  concepto: string | null;
}

interface FilaVersion {
  version: number;
  datos: DatosVersion;
  lineas: LineaVersion[];
  reemplazada_por: string | null;
  reemplazada_en: Date;
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

  crear(empresaId: string, d: CrearPartida, origen: OrigenPartida = "manual"): Promise<string> {
    return conReglas(async () => {
      const [fila] = await this.tx.$queryRaw<{ id: string }[]>`
        INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, documento_tipo, documento_numero, origen)
        VALUES (${empresaId}::uuid, ${d.sucursalId}::uuid, ${d.fecha}::date, ${d.tipo}::tipo_partida,
                ${d.concepto ?? null}, ${d.documentoTipo ?? null}, ${d.documentoNumero ?? null}, ${origen})
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
      explicacionDidactica: explicarPartidaDidactica(p.origen, lineas),
      totalDebe: debe.aTexto(),
      totalHaber: haber.aTexto(),
      diferencia: debe.menos(haber).abs().aTexto(),
      cuadra: debe.igualA(haber),
      creadoEn: p.creado_en.toISOString(),
      actualizadoEn: p.actualizado_en.toISOString(),
    };
  }

  async listarBorradores(
    empresaId: string,
    todasSucursales: boolean,
    sucursales: readonly string[],
  ): Promise<PartidaVista[]> {
    const partidas = await this.tx.$queryRaw<FilaPartida[]>`
      SELECT p.id::text, p.sucursal_id::text, to_char(p.fecha, 'YYYY-MM-DD') AS fecha,
             p.tipo::text, p.estado::text, p.numero, p.concepto, p.documento_tipo, p.documento_numero,
             p.origen, p.creado_en, p.actualizado_en
      FROM partidas p
      WHERE p.empresa_id = ${empresaId}::uuid
        AND p.estado = 'borrador'
        AND (${todasSucursales} OR p.sucursal_id = ANY(${[...sucursales]}::uuid[]))
      ORDER BY p.fecha DESC, p.actualizado_en DESC, p.id`;
    if (partidas.length === 0) return [];

    const ids = partidas.map((partida) => partida.id);
    const filas = await this.tx.$queryRaw<FilaLineaBorrador[]>`
      SELECT d.partida_id::text AS partida_id, d.cuenta_id::text, c.codigo, c.nombre,
             d.debe::text, d.haber::text, d.concepto
      FROM partida_detalles d
      JOIN cuentas c ON c.id = d.cuenta_id
      WHERE d.partida_id = ANY(${ids}::uuid[])
      ORDER BY d.partida_id, d.orden, d.id`;
    const porPartida = new Map<string, FilaLineaBorrador[]>();
    for (const fila of filas) {
      const lineas = porPartida.get(fila.partida_id) ?? [];
      lineas.push(fila);
      porPartida.set(fila.partida_id, lineas);
    }

    return partidas.map((p) => {
      const filasPartida = porPartida.get(p.id) ?? [];
      const lineas = filasPartida.map((l) => ({
        cuentaId: l.cuenta_id,
        codigo: l.codigo,
        nombre: l.nombre,
        debe: l.debe,
        haber: l.haber,
        concepto: l.concepto,
      }));
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
        explicacionDidactica: explicarPartidaDidactica(p.origen, lineas),
        totalDebe: debe.aTexto(),
        totalHaber: haber.aTexto(),
        diferencia: debe.menos(haber).abs().aTexto(),
        cuadra: debe.igualA(haber),
        creadoEn: p.creado_en.toISOString(),
        actualizadoEn: p.actualizado_en.toISOString(),
      };
    });
  }

  async versiones(empresaId: string, partidaId: string): Promise<PartidaVersionVista[]> {
    const filas = await this.tx.$queryRaw<FilaVersion[]>`
      SELECT version, datos, lineas, reemplazada_por::text, reemplazada_en
      FROM partida_versiones
      WHERE empresa_id = ${empresaId}::uuid AND partida_id = ${partidaId}::uuid
      ORDER BY version DESC`;

    return filas.map((fila) => {
      const datos = fila.datos;
      const lineas = fila.lineas.map((l) => ({
        cuentaId: l.cuenta_id,
        codigo: l.codigo,
        nombre: l.nombre,
        debe: l.debe,
        haber: l.haber,
        concepto: l.concepto,
      }));
      const debe = Dinero.sumar(lineas.map((l) => l.debe));
      const haber = Dinero.sumar(lineas.map((l) => l.haber));
      const partida: PartidaVista = {
        id: datos.id,
        sucursalId: datos.sucursal_id,
        fecha: datos.fecha.slice(0, 10),
        tipo: datos.tipo,
        estado: datos.estado,
        numero: datos.numero,
        concepto: datos.concepto,
        documentoTipo: datos.documento_tipo,
        documentoNumero: datos.documento_numero,
        origen: datos.origen,
        lineas,
        explicacionDidactica: explicarPartidaDidactica(datos.origen, lineas),
        totalDebe: debe.aTexto(),
        totalHaber: haber.aTexto(),
        diferencia: debe.menos(haber).abs().aTexto(),
        cuadra: debe.igualA(haber),
        creadoEn: new Date(datos.creado_en).toISOString(),
        actualizadoEn: new Date(datos.actualizado_en).toISOString(),
      };
      return {
        version: fila.version,
        reemplazadaEn: fila.reemplazada_en.toISOString(),
        reemplazadaPor: fila.reemplazada_por,
        partida,
      };
    });
  }
}

@Injectable()
export class RepositorioPartidasPrisma implements RepositorioPartidas {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadPartidas) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
