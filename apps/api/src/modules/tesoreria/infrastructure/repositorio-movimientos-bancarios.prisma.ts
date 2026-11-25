import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { comoUsuario, Prisma, type Tx } from "@contable/db";
import {
  Dinero,
  type CambiarEstadoCheque,
  type CrearMovimientoBancario,
  type FiltroMovimientosBancarios,
  type MovimientoBancarioVista,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  CuentaBancariaMovimientoNoEncontradaError,
  MovimientoBancarioDuplicadoError,
  MovimientoBancarioNoEncontradoError,
  ReglaMovimientoBancarioError,
  type AccesoMovimientoBancario,
  type CuentaBancariaMovimiento,
  type RepositorioMovimientoBancario,
  type UnidadMovimientoBancario,
} from "../domain/movimiento-bancario.js";

const incluirMovimiento = {
  cuentaTesoreria: { select: { nombre: true } },
  sucursal: { select: { nombre: true } },
  cuentaContrapartida: { select: { codigo: true, nombre: true } },
  partida: { select: { estado: true } },
} satisfies Prisma.MovimientoBancarioInclude;

type FilaMovimiento = Prisma.MovimientoBancarioGetPayload<{ include: typeof incluirMovimiento }>;

interface Linea {
  cuentaId: string;
  debe: string;
  haber: string;
  concepto: string;
}

function fechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function aVista(fila: FilaMovimiento): MovimientoBancarioVista {
  return {
    id: fila.id,
    cuentaTesoreriaId: fila.cuentaTesoreriaId,
    cuentaBancaria: fila.cuentaTesoreria.nombre,
    sucursalId: fila.sucursalId,
    sucursal: fila.sucursal.nombre,
    cuentaContrapartidaId: fila.cuentaContrapartidaId,
    cuentaContrapartidaCodigo: fila.cuentaContrapartida.codigo,
    cuentaContrapartidaNombre: fila.cuentaContrapartida.nombre,
    tipo: fila.tipo,
    fecha: fechaIso(fila.fecha),
    referencia: fila.referencia,
    comprobante: fila.comprobante,
    beneficiario: fila.beneficiario,
    concepto: fila.concepto,
    monto: fila.monto.toFixed(2),
    estadoCheque: fila.estadoCheque,
    fechaEstado: fila.fechaEstado ? fechaIso(fila.fechaEstado) : null,
    partidaId: fila.partidaId,
    partidaAnulacionId: fila.partidaAnulacionId,
    partidaEstado: fila.partida.estado,
  };
}

async function crearPartida(
  tx: Tx,
  usuarioId: string,
  empresaId: string,
  sucursalId: string,
  fecha: string,
  concepto: string,
  origen: "movimiento_bancario" | "movimiento_bancario_anulacion",
  origenId: string,
  lineas: readonly Linea[],
): Promise<string> {
  const debe = Dinero.sumar(lineas.map((linea) => linea.debe));
  const haber = Dinero.sumar(lineas.map((linea) => linea.haber));
  if (!debe.igualA(haber)) throw new ReglaMovimientoBancarioError("La partida debe quedar balanceada.");
  const [partida] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id, creado_por)
    VALUES (${empresaId}::uuid, ${sucursalId}::uuid, ${fecha}::date, 'operacion'::tipo_partida,
            ${concepto}, ${origen}, ${origenId}::uuid, ${usuarioId}::uuid)
    RETURNING id::text`;
  if (!partida) throw new Error("La base no devolvió el identificador de la partida bancaria.");
  await tx.$executeRaw`
    INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, concepto, orden)
    SELECT ${partida.id}::uuid, l.cuenta_id, l.debe, l.haber, l.concepto, (l.n - 1)::smallint
      FROM unnest(${lineas.map((linea) => linea.cuentaId)}::uuid[],
                  ${lineas.map((linea) => linea.debe)}::numeric[],
                  ${lineas.map((linea) => linea.haber)}::numeric[],
                  ${lineas.map((linea) => linea.concepto)}::text[])
           WITH ORDINALITY AS l(cuenta_id, debe, haber, concepto, n)`;
  return partida.id;
}

function indiceDuplicado(error: unknown): boolean {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return false;
  return JSON.stringify((error as { meta?: unknown }).meta ?? {}).includes(
    "movimientos_bancarios_empresa_id_cuenta_tesoreria_id_referencia",
  );
}

class UnidadPrismaMovimientoBancario implements UnidadMovimientoBancario {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoMovimientoBancario | null> {
    const membresia = await this.tx.membresia.findFirst({
      where: { usuarioId, empresaId, activa: true },
      select: { todasSucursales: true, sucursales: { select: { sucursalId: true } } },
    });
    return membresia
      ? {
          todasSucursales: membresia.todasSucursales,
          sucursales: membresia.sucursales.map((fila) => fila.sucursalId),
        }
      : null;
  }

  async cuenta(empresaId: string, id: string): Promise<CuentaBancariaMovimiento> {
    const cuenta = await this.tx.cuentaTesoreria.findFirst({
      where: { empresaId, id },
      select: { id: true, sucursalId: true, tipo: true, activa: true },
    });
    if (!cuenta) throw new CuentaBancariaMovimientoNoEncontradaError();
    return cuenta;
  }

  async existeSucursal(empresaId: string, sucursalId: string): Promise<boolean> {
    return (await this.tx.sucursal.count({ where: { id: sucursalId, empresaId, activa: true } })) > 0;
  }

  async listar(
    empresaId: string,
    filtro: FiltroMovimientosBancarios,
    acceso: AccesoMovimientoBancario,
  ): Promise<MovimientoBancarioVista[]> {
    const filas = await this.tx.movimientoBancario.findMany({
      where: {
        empresaId,
        cuentaTesoreriaId: filtro.cuentaTesoreriaId,
        fecha: {
          gte: new Date(`${filtro.desde}T00:00:00.000Z`),
          lte: new Date(`${filtro.hasta}T00:00:00.000Z`),
        },
        ...(!acceso.todasSucursales ? { sucursalId: { in: [...acceso.sucursales] } } : {}),
      },
      include: incluirMovimiento,
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
    });
    return filas.map(aVista);
  }

  async crear(
    usuarioId: string,
    empresaId: string,
    datos: CrearMovimientoBancario,
    acceso: AccesoMovimientoBancario,
  ): Promise<MovimientoBancarioVista> {
    const banco = await this.tx.cuentaTesoreria.findFirst({
      where: {
        id: datos.cuentaTesoreriaId,
        empresaId,
        activa: true,
        tipo: "banco",
        OR: [{ sucursalId: datos.sucursalId }, ...(acceso.todasSucursales ? [{ sucursalId: null }] : [])],
      },
      select: { id: true, cuentaId: true, sucursalId: true },
    });
    if (!banco) throw new CuentaBancariaMovimientoNoEncontradaError();

    const contrapartida = await this.tx.cuenta.findFirst({
      where: { id: datos.cuentaContrapartidaId, empresaId, activa: true },
      select: { id: true },
    });
    if (
      !contrapartida ||
      (await this.tx.cuenta.count({ where: { empresaId, cuentaPadreId: datos.cuentaContrapartidaId } })) > 0
    ) {
      throw new ReglaMovimientoBancarioError("La contrapartida debe ser una cuenta activa e imputable.");
    }

    const movimientoId = randomUUID();
    const salida = datos.tipo === "cheque" || datos.tipo === "nota_cargo";
    const partidaId = await crearPartida(
      this.tx,
      usuarioId,
      empresaId,
      datos.sucursalId,
      datos.fecha,
      datos.concepto,
      "movimiento_bancario",
      movimientoId,
      salida
        ? [
            {
              cuentaId: datos.cuentaContrapartidaId,
              debe: datos.monto,
              haber: "0.00",
              concepto: datos.concepto,
            },
            { cuentaId: banco.cuentaId, debe: "0.00", haber: datos.monto, concepto: datos.concepto },
          ]
        : [
            { cuentaId: banco.cuentaId, debe: datos.monto, haber: "0.00", concepto: datos.concepto },
            {
              cuentaId: datos.cuentaContrapartidaId,
              debe: "0.00",
              haber: datos.monto,
              concepto: datos.concepto,
            },
          ],
    );
    try {
      await this.tx.movimientoBancario.create({
        data: {
          id: movimientoId,
          empresaId,
          cuentaTesoreriaId: datos.cuentaTesoreriaId,
          sucursalId: datos.sucursalId,
          cuentaContrapartidaId: datos.cuentaContrapartidaId,
          tipo: datos.tipo,
          fecha: new Date(`${datos.fecha}T00:00:00.000Z`),
          referencia: datos.referencia,
          comprobante: datos.comprobante,
          beneficiario: datos.beneficiario ?? null,
          concepto: datos.concepto,
          monto: datos.monto,
          estadoCheque: datos.tipo === "cheque" ? "emitido" : null,
          partidaId,
        },
      });
    } catch (error) {
      if (indiceDuplicado(error)) throw new MovimientoBancarioDuplicadoError();
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaMovimientoBancarioError(regla);
      throw error;
    }
    return this.vista(empresaId, movimientoId);
  }

  async cambiarEstado(
    usuarioId: string,
    empresaId: string,
    id: string,
    datos: CambiarEstadoCheque,
  ): Promise<MovimientoBancarioVista> {
    const movimiento = await this.tx.movimientoBancario.findFirst({ where: { id, empresaId } });
    if (!movimiento) throw new MovimientoBancarioNoEncontradoError();
    if (movimiento.tipo !== "cheque" || movimiento.estadoCheque !== "emitido") {
      throw new ReglaMovimientoBancarioError("Solo un cheque emitido puede cobrarse o anularse.");
    }

    if (datos.estado === "cobrado") {
      await this.tx.movimientoBancario.update({
        where: { id },
        data: { estadoCheque: "cobrado", fechaEstado: new Date(`${datos.fecha}T00:00:00.000Z`) },
      });
      return this.vista(empresaId, id);
    }

    const banco = await this.tx.cuentaTesoreria.findFirst({
      where: { id: movimiento.cuentaTesoreriaId, empresaId },
      select: { cuentaId: true },
    });
    if (!banco) throw new CuentaBancariaMovimientoNoEncontradaError();
    const partidaAnulacionId = await crearPartida(
      this.tx,
      usuarioId,
      empresaId,
      movimiento.sucursalId,
      datos.fecha,
      `Anulación del cheque ${movimiento.referencia}`,
      "movimiento_bancario_anulacion",
      movimiento.id,
      [
        {
          cuentaId: banco.cuentaId,
          debe: movimiento.monto.toFixed(2),
          haber: "0.00",
          concepto: "Anulación de cheque",
        },
        {
          cuentaId: movimiento.cuentaContrapartidaId,
          debe: "0.00",
          haber: movimiento.monto.toFixed(2),
          concepto: "Anulación de cheque",
        },
      ],
    );
    await this.tx.movimientoBancario.update({
      where: { id },
      data: {
        estadoCheque: "anulado",
        fechaEstado: new Date(`${datos.fecha}T00:00:00.000Z`),
        partidaAnulacionId,
      },
    });
    return this.vista(empresaId, id);
  }

  async sucursalDeMovimiento(empresaId: string, id: string): Promise<string> {
    const movimiento = await this.tx.movimientoBancario.findFirst({
      where: { id, empresaId },
      select: { sucursalId: true },
    });
    if (!movimiento) throw new MovimientoBancarioNoEncontradoError();
    return movimiento.sucursalId;
  }

  private async vista(empresaId: string, id: string): Promise<MovimientoBancarioVista> {
    const movimiento = await this.tx.movimientoBancario.findFirst({
      where: { id, empresaId },
      include: incluirMovimiento,
    });
    if (!movimiento) throw new MovimientoBancarioNoEncontradoError();
    return aVista(movimiento);
  }
}

@Injectable()
export class RepositorioMovimientosBancariosPrisma implements RepositorioMovimientoBancario {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadMovimientoBancario) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrismaMovimientoBancario(tx)));
  }
}
