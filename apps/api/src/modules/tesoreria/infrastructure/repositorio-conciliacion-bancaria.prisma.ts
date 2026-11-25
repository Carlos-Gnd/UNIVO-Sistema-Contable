import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import {
  Dinero,
  type ActualizarDetalleConciliacion,
  type ConciliacionBancariaVista,
  type CrearConciliacionBancaria,
  type ResultadoImportacionEstadoCuenta,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  ConciliacionCuentaNoEncontradaError,
  ConciliacionDuplicadaError,
  ConciliacionNoEncontradaError,
  ReglaConciliacionError,
  type CuentaConciliacion,
  type RepositorioConciliacion,
  type UnidadConciliacion,
  type LineaEstadoCuentaEntrada,
} from "../domain/conciliacion-bancaria.js";

interface FilaLibro {
  partida_detalle_id: string;
  fecha: Date;
  referencia: string | null;
  concepto: string;
  debe: string;
  haber: string;
  conciliado: boolean;
}

class UnidadPrismaConciliacion implements UnidadConciliacion {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string) {
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

  async cuenta(empresaId: string, id: string): Promise<CuentaConciliacion> {
    const cuenta = await this.tx.cuentaTesoreria.findFirst({
      where: { empresaId, id },
      select: { id: true, tipo: true, sucursalId: true, activa: true },
    });
    if (!cuenta) throw new ConciliacionCuentaNoEncontradaError();
    return cuenta;
  }

  async crear(usuarioId: string, empresaId: string, datos: CrearConciliacionBancaria) {
    const existente = await this.tx.conciliacionBancaria.findFirst({
      where: {
        empresaId,
        cuentaTesoreriaId: datos.cuentaTesoreriaId,
        fechaCorte: new Date(`${datos.fechaCorte}T00:00:00.000Z`),
      },
    });
    if (existente) {
      if (existente.saldoEstado.toFixed(2) !== datos.saldoEstado) throw new ConciliacionDuplicadaError();
      return this.vista(empresaId, existente.id);
    }
    const cuenta = await this.tx.cuentaTesoreria.findFirst({
      where: { empresaId, id: datos.cuentaTesoreriaId, tipo: "banco", activa: true },
      select: { id: true },
    });
    if (!cuenta) throw new ConciliacionCuentaNoEncontradaError();
    let id: string;
    try {
      const creada = await this.tx.conciliacionBancaria.create({
        data: {
          empresaId,
          cuentaTesoreriaId: datos.cuentaTesoreriaId,
          fechaCorte: new Date(`${datos.fechaCorte}T00:00:00.000Z`),
          saldoEstado: datos.saldoEstado,
          creadoPor: usuarioId,
        },
        select: { id: true },
      });
      id = creada.id;
    } catch (error) {
      if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") {
        throw new ConciliacionDuplicadaError();
      }
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaConciliacionError(regla);
      throw error;
    }
    return this.vista(empresaId, id);
  }

  async detalle(empresaId: string, id: string) {
    return this.vista(empresaId, id);
  }

  async marcar(empresaId: string, id: string, detalle: ActualizarDetalleConciliacion) {
    const conciliacion = await this.tx.conciliacionBancaria.findFirst({ where: { id, empresaId } });
    if (!conciliacion) throw new ConciliacionNoEncontradaError();
    try {
      await this.tx.detalleConciliacionBancaria.upsert({
        where: {
          conciliacionId_partidaDetalleId: { conciliacionId: id, partidaDetalleId: detalle.partidaDetalleId },
        },
        create: {
          empresaId,
          conciliacionId: id,
          partidaDetalleId: detalle.partidaDetalleId,
          conciliado: detalle.conciliado,
        },
        update: { conciliado: detalle.conciliado },
      });
    } catch (error) {
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaConciliacionError(regla);
      if (error && typeof error === "object" && (error as { code?: string }).code === "P2003") {
        throw new ReglaConciliacionError("La línea no pertenece a este corte o no está contabilizada.");
      }
      throw error;
    }
    return this.vista(empresaId, id);
  }

  async estadoCuenta(
    empresaId: string,
    id: string,
    filas: LineaEstadoCuentaEntrada[],
    guardar: boolean,
  ): Promise<ResultadoImportacionEstadoCuenta[]> {
    const conciliacion = await this.tx.conciliacionBancaria.findFirst({
      where: { id, empresaId },
      include: { cuentaTesoreria: { select: { cuentaId: true } } },
    });
    if (!conciliacion) throw new ConciliacionNoEncontradaError();
    const resultados: ResultadoImportacionEstadoCuenta[] = [];
    for (const fila of filas) {
      const previa = await this.tx.lineaEstadoCuenta.findFirst({
        where: { conciliacionId: id, huella: fila.huella },
        select: { id: true },
      });
      if (previa) {
        resultados.push({
          numeroFila: fila.numeroFila,
          fecha: fila.fecha,
          referencia: fila.referencia,
          descripcion: fila.descripcion,
          monto: fila.monto,
          estado: "duplicada",
          detalle: "La fila ya se importó en esta conciliación.",
          partidaDetalleId: null,
        });
        continue;
      }
      const candidatas = await this.tx.$queryRaw<{ id: string }[]>`
        SELECT d.id::text AS id
          FROM movimientos_bancarios m
          JOIN partidas p ON p.id = m.partida_id
          JOIN partida_detalles d ON d.partida_id = p.id AND d.cuenta_id = ${conciliacion.cuentaTesoreria.cuentaId}::uuid
         WHERE m.empresa_id = ${empresaId}::uuid AND m.cuenta_tesoreria_id = ${conciliacion.cuentaTesoreriaId}::uuid
           AND m.referencia = ${fila.referencia} AND m.fecha = ${fila.fecha}::date
           AND (d.debe - d.haber)::numeric(14,2) = ${fila.monto}::numeric(14,2)
           AND p.fecha <= ${conciliacion.fechaCorte}::date AND p.estado IN ('contabilizada', 'anulada')
         ORDER BY p.creado_en`;
      const coincide = candidatas.length === 1 ? candidatas[0]!.id : null;
      let estado: ResultadoImportacionEstadoCuenta["estado"] = coincide ? "coincide" : "revision";
      let detalle = coincide
        ? "Coincidencia exacta por fecha, referencia y monto."
        : "No hay una coincidencia única; revisa la fila manualmente.";
      if (guardar) {
        try {
          await this.tx.lineaEstadoCuenta.create({
            data: {
              empresaId,
              conciliacionId: id,
              numeroFila: fila.numeroFila,
              fecha: new Date(`${fila.fecha}T00:00:00.000Z`),
              referencia: fila.referencia,
              descripcion: fila.descripcion,
              monto: fila.monto,
              huella: fila.huella,
              partidaDetalleId: coincide,
            },
          });
          if (coincide) {
            await this.tx.detalleConciliacionBancaria.upsert({
              where: { conciliacionId_partidaDetalleId: { conciliacionId: id, partidaDetalleId: coincide } },
              create: { empresaId, conciliacionId: id, partidaDetalleId: coincide, conciliado: true },
              update: { conciliado: true },
            });
          }
        } catch (error) {
          if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") {
            estado = "duplicada";
            detalle = "La fila o el movimiento ya existe en esta conciliación.";
          } else {
            const regla = mensajeDeRegla(error);
            if (regla) throw new ReglaConciliacionError(regla);
            throw error;
          }
        }
      }
      resultados.push({
        numeroFila: fila.numeroFila,
        fecha: fila.fecha,
        referencia: fila.referencia,
        descripcion: fila.descripcion,
        monto: fila.monto,
        estado,
        detalle,
        partidaDetalleId: estado === "coincide" ? coincide : null,
      });
    }
    return resultados;
  }

  private async vista(empresaId: string, id: string): Promise<ConciliacionBancariaVista> {
    const conciliacion = await this.tx.conciliacionBancaria.findFirst({
      where: { empresaId, id },
      include: { cuentaTesoreria: { select: { nombre: true, cuentaId: true } } },
    });
    if (!conciliacion) throw new ConciliacionNoEncontradaError();
    const anterior = await this.tx.conciliacionBancaria.findFirst({
      where: {
        empresaId,
        cuentaTesoreriaId: conciliacion.cuentaTesoreriaId,
        fechaCorte: { lt: conciliacion.fechaCorte },
      },
      orderBy: { fechaCorte: "desc" },
      select: { fechaCorte: true },
    });
    const desde = anterior
      ? new Date(anterior.fechaCorte.getTime() + 86_400_000)
      : new Date(
          Date.UTC(conciliacion.fechaCorte.getUTCFullYear(), conciliacion.fechaCorte.getUTCMonth(), 1),
        );
    const lineas = await this.tx.$queryRaw<FilaLibro[]>`
      SELECT d.id::text AS partida_detalle_id, p.fecha,
             COALESCE(m.referencia, p.documento_numero) AS referencia,
             COALESCE(d.concepto, p.concepto, 'Movimiento bancario') AS concepto,
             d.debe::text AS debe, d.haber::text AS haber,
             COALESCE(dc.conciliado, false) AS conciliado
        FROM partida_detalles d
        JOIN partidas p ON p.id = d.partida_id
        LEFT JOIN movimientos_bancarios m ON m.partida_id = p.id OR m.partida_anulacion_id = p.id
        LEFT JOIN detalles_conciliacion_bancaria dc ON dc.conciliacion_id = ${id}::uuid AND dc.partida_detalle_id = d.id
       WHERE d.empresa_id = ${empresaId}::uuid AND d.cuenta_id = ${conciliacion.cuentaTesoreria.cuentaId}::uuid
         AND p.fecha <= ${conciliacion.fechaCorte}::date AND p.fecha >= ${desde}::date
         AND p.estado IN ('contabilizada', 'anulada') AND (d.debe <> 0 OR d.haber <> 0)
       ORDER BY p.fecha, p.creado_en, d.orden`;
    const libro = await this.tx.$queryRaw<{ saldo: string }[]>`
      SELECT COALESCE(SUM(d.debe - d.haber), 0)::numeric(14,2)::text AS saldo
        FROM partida_detalles d JOIN partidas p ON p.id = d.partida_id
       WHERE d.empresa_id = ${empresaId}::uuid AND d.cuenta_id = ${conciliacion.cuentaTesoreria.cuentaId}::uuid
         AND p.fecha <= ${conciliacion.fechaCorte}::date AND p.estado IN ('contabilizada', 'anulada')`;
    const filasEstado = await this.tx.lineaEstadoCuenta.findMany({
      where: { empresaId, conciliacionId: id },
      orderBy: { numeroFila: "asc" },
      select: {
        numeroFila: true,
        fecha: true,
        referencia: true,
        descripcion: true,
        monto: true,
        partidaDetalleId: true,
      },
    });
    const saldoLibros = Dinero.de(libro[0]?.saldo ?? "0.00");
    const depositos = Dinero.sumar(lineas.filter((linea) => !linea.conciliado).map((linea) => linea.debe));
    const cheques = Dinero.sumar(lineas.filter((linea) => !linea.conciliado).map((linea) => linea.haber));
    const saldoEstado = Dinero.de(conciliacion.saldoEstado.toFixed(2));
    const diferencia = saldoEstado.mas(depositos).menos(cheques).menos(saldoLibros);
    return {
      id: conciliacion.id,
      cuentaTesoreriaId: conciliacion.cuentaTesoreriaId,
      cuentaBancaria: conciliacion.cuentaTesoreria.nombre,
      fechaCorte: conciliacion.fechaCorte.toISOString().slice(0, 10),
      saldoEstado: saldoEstado.aTexto(),
      depositosEnTransito: depositos.aTexto(),
      chequesEnCirculacion: cheques.aTexto(),
      saldoLibros: saldoLibros.aTexto(),
      diferencia: diferencia.aTexto(),
      lineas: lineas.map((linea) => ({
        partidaDetalleId: linea.partida_detalle_id,
        fecha: linea.fecha.toISOString().slice(0, 10),
        referencia: linea.referencia,
        concepto: linea.concepto,
        debe: Dinero.de(linea.debe).aTexto(),
        haber: Dinero.de(linea.haber).aTexto(),
        conciliado: linea.conciliado,
      })),
      lineasEstadoCuenta: filasEstado.map((fila) => ({
        numeroFila: fila.numeroFila,
        fecha: fila.fecha.toISOString().slice(0, 10),
        referencia: fila.referencia,
        descripcion: fila.descripcion,
        monto: fila.monto.toFixed(2),
        estado: fila.partidaDetalleId ? "coincide" : "revision",
        detalle: fila.partidaDetalleId
          ? "Coincidencia exacta por fecha, referencia y monto."
          : "No hay una coincidencia única; revisa la fila manualmente.",
        partidaDetalleId: fila.partidaDetalleId,
      })),
    };
  }
}

@Injectable()
export class RepositorioConciliacionBancariaPrisma implements RepositorioConciliacion {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadConciliacion) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx: Tx) => fn(new UnidadPrismaConciliacion(tx)));
  }
}
