import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { CrearCuentaTesoreria, CuentaTesoreriaVista, EditarCuentaTesoreria } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  CuentaBancariaDuplicadaError,
  CuentaContableEnUsoError,
  CuentaContableNoEncontradaError,
  CuentaTesoreriaNoEncontradaError,
  ReglaTesoreriaError,
  type AccesoTesoreria,
  type RepositorioTesoreria,
  type UnidadTesoreria,
} from "../domain/cuenta-tesoreria.js";

/** Índice único que violó la operación (P2002): la cuenta contable o el par banco y número de cuenta. */
export function indiceDuplicado(error: unknown): "cuenta" | "banco" | null {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return null;
  const detalle = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  if (detalle.includes("cuentas_tesoreria_cuenta_id")) return "cuenta";
  if (detalle.includes("cuentas_tesoreria_empresa_id_banco")) return "banco";
  return null;
}

interface FilaCuenta {
  id: string;
  tipo: "caja" | "banco";
  nombre: string;
  banco: string | null;
  numero_cuenta: string | null;
  cuenta_id: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  sucursal_id: string | null;
  sucursal: string | null;
  activa: boolean;
  saldo: string;
}

const aVista = (f: FilaCuenta): CuentaTesoreriaVista => ({
  id: f.id,
  tipo: f.tipo,
  nombre: f.nombre,
  banco: f.banco,
  numeroCuenta: f.numero_cuenta,
  cuentaId: f.cuenta_id,
  cuentaCodigo: f.cuenta_codigo,
  cuentaNombre: f.cuenta_nombre,
  sucursalId: f.sucursal_id,
  sucursal: f.sucursal,
  activa: f.activa,
  saldo: f.saldo,
});

class UnidadPrisma implements UnidadTesoreria {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoTesoreria | null> {
    const m = await this.tx.membresia.findFirst({
      where: { usuarioId, empresaId, activa: true },
      select: { todasSucursales: true, sucursales: { select: { sucursalId: true } } },
    });
    return m
      ? { todasSucursales: m.todasSucursales, sucursales: m.sucursales.map((s) => s.sucursalId) }
      : null;
  }

  async existeSucursal(empresaId: string, sucursalId: string): Promise<boolean> {
    return (await this.tx.sucursal.count({ where: { id: sucursalId, empresaId } })) > 0;
  }

  /**
   * Cuentas con su saldo actual: debe menos haber de la cuenta contable en partidas contabilizadas o anuladas
   * (una anulada y su reversión se compensan). Si la caja es de una sucursal, solo cuentan las partidas de ella.
   */
  private async consultar(empresaId: string, filtro: { id?: string; sucursales?: readonly string[] }) {
    const id = filtro.id ?? null;
    const sucursales = filtro.sucursales ? [...filtro.sucursales] : null;
    const filas = await this.tx.$queryRaw<FilaCuenta[]>`
      SELECT ct.id::text, ct.tipo::text AS tipo, ct.nombre, ct.banco, ct.numero_cuenta, ct.cuenta_id::text,
             c.codigo AS cuenta_codigo, c.nombre AS cuenta_nombre, ct.sucursal_id::text, s.nombre AS sucursal, ct.activa,
             (SELECT coalesce(sum(d.debe - d.haber), 0)::numeric(14,2)::text
                FROM partida_detalles d JOIN partidas p ON p.id = d.partida_id
               WHERE d.cuenta_id = ct.cuenta_id AND p.estado IN ('contabilizada', 'anulada')
                 AND (ct.sucursal_id IS NULL OR p.sucursal_id = ct.sucursal_id)) AS saldo
        FROM cuentas_tesoreria ct
        JOIN cuentas c ON c.id = ct.cuenta_id
        LEFT JOIN sucursales s ON s.id = ct.sucursal_id
       WHERE ct.empresa_id = ${empresaId}::uuid
         AND (${id}::uuid IS NULL OR ct.id = ${id}::uuid)
         AND (${sucursales}::uuid[] IS NULL OR ct.sucursal_id = ANY(${sucursales}::uuid[]))
       ORDER BY ct.tipo, ct.nombre`;
    return filas.map(aVista);
  }

  cuentas(empresaId: string, acceso: AccesoTesoreria): Promise<CuentaTesoreriaVista[]> {
    return this.consultar(empresaId, acceso.todasSucursales ? {} : { sucursales: acceso.sucursales });
  }

  async cuenta(empresaId: string, id: string): Promise<CuentaTesoreriaVista> {
    const [c] = await this.consultar(empresaId, { id });
    if (!c) throw new CuentaTesoreriaNoEncontradaError();
    return c;
  }

  async crear(empresaId: string, datos: CrearCuentaTesoreria): Promise<CuentaTesoreriaVista> {
    const cuenta = await this.tx.cuenta.findFirst({ where: { id: datos.cuentaId, empresaId } });
    if (!cuenta) throw new CuentaContableNoEncontradaError();
    try {
      const creada = await this.tx.cuentaTesoreria.create({
        data: {
          empresaId,
          cuentaId: datos.cuentaId,
          sucursalId: datos.sucursalId ?? null,
          tipo: datos.tipo,
          nombre: datos.nombre,
          banco: datos.banco ?? null,
          numeroCuenta: datos.numeroCuenta ?? null,
        },
      });
      return this.cuenta(empresaId, creada.id);
    } catch (e) {
      throw this.traducir(e, datos.banco, datos.numeroCuenta);
    }
  }

  async editar(empresaId: string, id: string, cambios: EditarCuentaTesoreria): Promise<CuentaTesoreriaVista> {
    const actual = await this.tx.cuentaTesoreria.findFirst({ where: { id, empresaId } });
    if (!actual) throw new CuentaTesoreriaNoEncontradaError();
    if (actual.tipo === "caja" && (cambios.banco !== undefined || cambios.numeroCuenta !== undefined)) {
      throw new ReglaTesoreriaError("Una caja no lleva banco ni número de cuenta.");
    }
    try {
      await this.tx.cuentaTesoreria.update({
        where: { id },
        data: {
          ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
          ...(cambios.banco !== undefined ? { banco: cambios.banco } : {}),
          ...(cambios.numeroCuenta !== undefined ? { numeroCuenta: cambios.numeroCuenta } : {}),
          ...(cambios.sucursalId !== undefined ? { sucursalId: cambios.sucursalId } : {}),
          ...(cambios.activa !== undefined ? { activa: cambios.activa } : {}),
        },
      });
      return this.cuenta(empresaId, id);
    } catch (e) {
      throw this.traducir(
        e,
        cambios.banco ?? actual.banco ?? "",
        cambios.numeroCuenta ?? actual.numeroCuenta ?? "",
      );
    }
  }

  private traducir(e: unknown, banco?: string, numero?: string): unknown {
    const duplicado = indiceDuplicado(e);
    if (duplicado === "cuenta") return new CuentaContableEnUsoError();
    if (duplicado === "banco") return new CuentaBancariaDuplicadaError(banco ?? "", numero ?? "");
    const regla = mensajeDeRegla(e);
    return regla ? new ReglaTesoreriaError(regla) : e;
  }
}

@Injectable()
export class RepositorioTesoreriaPrisma implements RepositorioTesoreria {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadTesoreria) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
