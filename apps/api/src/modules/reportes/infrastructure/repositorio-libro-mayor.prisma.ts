import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { Naturaleza, TipoPartida } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type {
  AccesoLibroMayor,
  ConsultaMovimientosLibroMayor,
  DatosCuentaLibroMayor,
  FilaLibroMayor,
  RepositorioLibroMayor,
  UnidadLibroMayor,
} from "../domain/libro-mayor.js";

interface FilaMovimientoSql {
  fecha: string;
  partida_id: string;
  numero: number;
  tipo: TipoPartida;
  concepto: string | null;
  sucursal_id: string;
  sucursal: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  debe: string;
  haber: string;
  saldo_anterior: string;
  saldo: string;
}

class UnidadPrismaLibroMayor implements UnidadLibroMayor {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoLibroMayor | null> {
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

  async existeSucursal(empresaId: string, sucursalId: string): Promise<boolean> {
    const [fila] = await this.tx.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM sucursales WHERE id = ${sucursalId}::uuid AND empresa_id = ${empresaId}::uuid) AS existe`;
    return fila?.existe ?? false;
  }

  async cuenta(c: ConsultaMovimientosLibroMayor): Promise<DatosCuentaLibroMayor | null> {
    const [cuenta] = await this.tx.$queryRaw<
      { cuenta_id: string; codigo: string; nombre: string; naturaleza: Naturaleza }[]
    >`
      SELECT id::text AS cuenta_id, codigo, nombre, naturaleza::text AS naturaleza
      FROM cuentas
      WHERE id = ${c.cuentaId}::uuid AND empresa_id = ${c.empresaId}::uuid`;
    if (!cuenta) return null;

    const todas = c.sucursales === null;
    const filas = await this.tx.$queryRaw<FilaMovimientoSql[]>`
      WITH movimientos AS (
        SELECT p.fecha, p.id AS partida_id, p.numero, p.tipo::text AS tipo,
               COALESCE(d.concepto, p.concepto) AS concepto,
               p.sucursal_id, s.nombre AS sucursal,
               c.codigo AS cuenta_codigo, c.nombre AS cuenta_nombre,
               d.debe, d.haber, d.orden,
               CASE WHEN ${cuenta.naturaleza}::text = 'acreedora' THEN d.haber - d.debe ELSE d.debe - d.haber END AS saldo_movimiento
        FROM partida_detalles d
        JOIN partidas p ON p.id = d.partida_id
        JOIN sucursales s ON s.id = p.sucursal_id
        JOIN cuentas c ON c.id = d.cuenta_id AND c.empresa_id = p.empresa_id
        WHERE p.empresa_id = ${c.empresaId}::uuid
          AND left(c.codigo, length(${cuenta.codigo})) = ${cuenta.codigo}
          AND p.estado IN ('contabilizada', 'anulada')
          AND (${c.hasta}::date IS NULL OR p.fecha <= ${c.hasta}::date)
          AND (${todas} OR p.sucursal_id = ANY(${[...(c.sucursales ?? [])]}::uuid[]))
      ), acumulados AS (
        SELECT *,
          COALESCE(SUM(saldo_movimiento) OVER (
            ORDER BY fecha, numero, orden, partida_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0)::text AS saldo_anterior,
          SUM(saldo_movimiento) OVER (
            ORDER BY fecha, numero, orden, partida_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )::text AS saldo
        FROM movimientos
      )
      SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, partida_id::text, numero, tipo, concepto,
             sucursal_id::text, sucursal, cuenta_codigo, cuenta_nombre,
             debe::text, haber::text, saldo_anterior, saldo
      FROM acumulados
      ORDER BY fecha, numero, orden, partida_id`;

    const movimientos: FilaLibroMayor[] = filas.map((f) => ({
      fecha: f.fecha,
      partidaId: f.partida_id,
      numero: f.numero,
      tipo: f.tipo,
      concepto: f.concepto,
      sucursalId: f.sucursal_id,
      sucursal: f.sucursal,
      cuentaCodigo: f.cuenta_codigo,
      cuentaNombre: f.cuenta_nombre,
      debe: f.debe,
      haber: f.haber,
      saldoAnterior: f.saldo_anterior,
      saldo: f.saldo,
    }));
    return {
      cuentaId: cuenta.cuenta_id,
      codigo: cuenta.codigo,
      nombre: cuenta.nombre,
      naturaleza: cuenta.naturaleza,
      movimientos,
    };
  }
}

@Injectable()
export class RepositorioLibroMayorPrisma implements RepositorioLibroMayor {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadLibroMayor) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrismaLibroMayor(tx)));
  }
}
