import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import { TIPOS_DE_PARTIDA_EN_BALANZA, type Naturaleza, type TipoCuenta } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type { AccesoReportes, ConsultaSaldos, FilaSaldos, RangoEjercicio } from "../domain/balanza.js";
import type { RepositorioBalanza, UnidadBalanza } from "../domain/repositorio-balanza.js";

interface FilaSql {
  cuenta_id: string;
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  tipo: TipoCuenta;
  saldo_inicial: string;
  movimiento_debe: string;
  movimiento_haber: string;
}

/** Consultas de la balanza; los estados financieros la extienden (repositorio-estados.prisma.ts). */
export class UnidadPrisma implements UnidadBalanza {
  constructor(protected readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoReportes | null> {
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

  async ejercicioDe(empresaId: string, fecha: string): Promise<RangoEjercicio | null> {
    const [fila] = await this.tx.$queryRaw<{ inicio: string; fin: string }[]>`
      SELECT to_char(fecha_inicio, 'YYYY-MM-DD') AS inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fin
      FROM ejercicios
      WHERE empresa_id = ${empresaId}::uuid AND ${fecha}::date BETWEEN fecha_inicio AND fecha_fin`;
    return fila ?? null;
  }

  /**
   * Suma por cuenta de último nivel (solo ellas reciben movimientos). Entran las partidas contabilizadas y
   * las anuladas: la anulada y su reversión se compensan. Del ejercicio entran los tipos de partida de la
   * balanza; de los ejercicios anteriores solo cuentan las cuentas de balance, con todos sus movimientos.
   */
  async saldos(c: ConsultaSaldos): Promise<FilaSaldos[]> {
    const tipos = [...TIPOS_DE_PARTIDA_EN_BALANZA[c.tipo]];
    const todas = c.sucursales === null;
    const filas = await this.tx.$queryRaw<FilaSql[]>`
      SELECT c.id::text AS cuenta_id, c.codigo, c.nombre, c.naturaleza::text AS naturaleza, c.tipo::text AS tipo,
             COALESCE(SUM(CASE WHEN p.fecha < ${c.desde}::date THEN d.debe - d.haber END), 0)::text AS saldo_inicial,
             COALESCE(SUM(CASE WHEN p.fecha >= ${c.desde}::date THEN d.debe END), 0)::text AS movimiento_debe,
             COALESCE(SUM(CASE WHEN p.fecha >= ${c.desde}::date THEN d.haber END), 0)::text AS movimiento_haber
      FROM partida_detalles d
      JOIN partidas p ON p.id = d.partida_id
      JOIN cuentas c ON c.id = d.cuenta_id
      WHERE p.empresa_id = ${c.empresaId}::uuid
        AND p.estado IN ('contabilizada', 'anulada')
        AND p.fecha <= ${c.hasta}::date
        AND (${todas} OR p.sucursal_id = ANY(${[...(c.sucursales ?? [])]}::uuid[]))
        AND (
          (p.fecha < ${c.inicioEjercicio}::date AND c.tipo NOT IN ('ingresos', 'costos_gastos', 'liquidadora'))
          OR (p.fecha >= ${c.inicioEjercicio}::date AND p.tipo = ANY(${tipos}::tipo_partida[]))
        )
      GROUP BY c.id, c.codigo, c.nombre, c.naturaleza, c.tipo
      ORDER BY c.codigo`;
    return filas.map((f) => ({
      cuentaId: f.cuenta_id,
      codigo: f.codigo,
      nombre: f.nombre,
      naturaleza: f.naturaleza,
      tipo: f.tipo,
      saldoInicial: f.saldo_inicial,
      movimientoDebe: f.movimiento_debe,
      movimientoHaber: f.movimiento_haber,
    }));
  }
}

@Injectable()
export class RepositorioBalanzaPrisma implements RepositorioBalanza {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadBalanza) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
