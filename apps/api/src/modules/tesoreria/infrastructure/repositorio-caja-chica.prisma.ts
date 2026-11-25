import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { comoUsuario, Prisma, type Tx } from "@contable/db";
import {
  Dinero,
  type CajaChicaVista,
  type CrearCajaChica,
  type CrearValeCajaChica,
  type ReintegrarCajaChica,
  type ValeCajaChicaVista,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  CajaChicaDuplicadaError,
  CajaChicaNoEncontradaError,
  CuentaCajaChicaInvalidaError,
  CuentaGastoCajaChicaInvalidaError,
  ReglaCajaChicaError,
  SinValesPorReintegrarError,
  type AccesoCajaChica,
  type RepositorioCajaChica,
  type UnidadCajaChica,
} from "../domain/caja-chica.js";

const incluirCaja = {
  sucursal: { select: { nombre: true } },
  cuentaTesoreria: { include: { cuenta: { select: { codigo: true, nombre: true } } } },
  vales: {
    include: { cuentaGasto: { select: { codigo: true, nombre: true } } },
    orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
  },
} satisfies Prisma.CajaChicaInclude;

type FilaCajaChica = Prisma.CajaChicaGetPayload<{ include: typeof incluirCaja }>;

interface Linea {
  cuentaId: string;
  debe: string;
  haber: string;
  concepto: string;
}

function aFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function aValeVista(fila: FilaCajaChica["vales"][number]): ValeCajaChicaVista {
  const neto = fila.montoNeto.toFixed(2);
  const iva = fila.iva.toFixed(2);
  return {
    id: fila.id,
    fecha: aFecha(fila.fecha),
    comprobante: fila.comprobante,
    concepto: fila.concepto,
    montoNeto: neto,
    iva,
    total: Dinero.de(neto).mas(iva).aTexto(),
    estado: fila.estado,
    cuentaGastoId: fila.cuentaGastoId,
    cuentaGastoCodigo: fila.cuentaGasto.codigo,
    cuentaGastoNombre: fila.cuentaGasto.nombre,
    partidaReintegroId: fila.partidaReintegroId,
  };
}

function aVista(fila: FilaCajaChica): CajaChicaVista {
  const vales = fila.vales.map(aValeVista);
  const pendientes = vales.filter((vale) => vale.estado === "por_reintegrar");
  const valesPorReintegrar = Dinero.sumar(pendientes.map((vale) => vale.total));
  const fondoFijo = fila.fondoFijo.toFixed(2);
  return {
    id: fila.id,
    sucursalId: fila.sucursalId,
    sucursal: fila.sucursal.nombre,
    cuentaTesoreriaId: fila.cuentaTesoreriaId,
    cuentaCodigo: fila.cuentaTesoreria.cuenta.codigo,
    cuentaNombre: fila.cuentaTesoreria.cuenta.nombre,
    fondoFijo,
    valesPorReintegrar: valesPorReintegrar.aTexto(),
    efectivoDisponible: Dinero.de(fondoFijo).menos(valesPorReintegrar).aTexto(),
    totalVales: Dinero.sumar(vales.map((vale) => vale.total)).aTexto(),
    partidaAperturaId: fila.partidaAperturaId,
    vales,
  };
}

function indiceDuplicado(error: unknown): "sucursal" | "cuenta" | null {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return null;
  const meta = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  if (meta.includes("cajas_chicas_empresa_id_sucursal_id")) return "sucursal";
  if (meta.includes("cajas_chicas_cuenta_tesoreria_id")) return "cuenta";
  return null;
}

async function validarCuentaTesoreria(
  tx: Tx,
  empresaId: string,
  sucursalId: string,
  id: string,
  acceso: AccesoCajaChica,
) {
  const sucursalesPermitidas = [{ sucursalId }, ...(acceso.todasSucursales ? [{ sucursalId: null }] : [])];
  const cuenta = await tx.cuentaTesoreria.findFirst({
    where: { id, empresaId, activa: true, OR: sucursalesPermitidas },
    include: { cuenta: true },
  });
  if (!cuenta)
    throw new CuentaCajaChicaInvalidaError("La cuenta de tesorería no existe en esta empresa o sucursal.");
  return cuenta;
}

async function validarCuentaGasto(tx: Tx, empresaId: string, cuentaId: string) {
  const cuenta = await tx.cuenta.findFirst({
    where: { id: cuentaId, empresaId, activa: true, tipo: "costos_gastos" },
    select: { id: true },
  });
  if (!cuenta || (await tx.cuenta.count({ where: { empresaId, cuentaPadreId: cuentaId } })) > 0) {
    throw new CuentaGastoCajaChicaInvalidaError();
  }
}

async function validarCuentaIva(tx: Tx, empresaId: string): Promise<string> {
  const cuenta = await tx.cuenta.findFirst({
    where: { empresaId, codigo: "1112", activa: true },
    select: { id: true },
  });
  if (!cuenta || (await tx.cuenta.count({ where: { empresaId, cuentaPadreId: cuenta.id } })) > 0) {
    throw new CuentaCajaChicaInvalidaError(
      "El catálogo necesita la cuenta activa e imputable 1112 Crédito Fiscal IVA.",
    );
  }
  return cuenta.id;
}

async function crearPartida(
  tx: Tx,
  usuarioId: string,
  empresaId: string,
  sucursalId: string,
  fecha: string,
  concepto: string,
  origen: "caja_chica_apertura" | "caja_chica_reintegro",
  origenId: string,
  lineas: readonly Linea[],
): Promise<string> {
  const debe = Dinero.sumar(lineas.map((linea) => linea.debe));
  const haber = Dinero.sumar(lineas.map((linea) => linea.haber));
  if (!debe.igualA(haber)) throw new ReglaCajaChicaError("La partida de caja chica debe quedar balanceada.");

  const [partida] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id, creado_por)
    VALUES (${empresaId}::uuid, ${sucursalId}::uuid, ${fecha}::date, 'operacion'::tipo_partida,
            ${concepto}, ${origen}, ${origenId}::uuid, ${usuarioId}::uuid)
    RETURNING id::text`;
  if (!partida) throw new Error("La base no devolvió el id de la partida de caja chica.");

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

class UnidadPrismaCajaChica implements UnidadCajaChica {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoCajaChica | null> {
    const membresia = await this.tx.membresia.findFirst({
      where: { usuarioId, empresaId, activa: true },
      select: { todasSucursales: true, sucursales: { select: { sucursalId: true } } },
    });
    return membresia
      ? {
          todasSucursales: membresia.todasSucursales,
          sucursales: membresia.sucursales.map((sucursal) => sucursal.sucursalId),
        }
      : null;
  }

  async existeSucursal(empresaId: string, sucursalId: string): Promise<boolean> {
    return (await this.tx.sucursal.count({ where: { id: sucursalId, empresaId, activa: true } })) > 0;
  }

  async cajas(empresaId: string, acceso: AccesoCajaChica): Promise<CajaChicaVista[]> {
    const filas = await this.tx.cajaChica.findMany({
      where: {
        empresaId,
        ...(!acceso.todasSucursales ? { sucursalId: { in: [...acceso.sucursales] } } : {}),
      },
      include: incluirCaja,
      orderBy: [{ sucursal: { nombre: "asc" } }],
    });
    return filas.map(aVista);
  }

  async caja(empresaId: string, id: string): Promise<{ id: string; sucursalId: string }> {
    const caja = await this.tx.cajaChica.findFirst({
      where: { id, empresaId },
      select: { id: true, sucursalId: true },
    });
    if (!caja) throw new CajaChicaNoEncontradaError();
    return caja;
  }

  async abrir(
    usuarioId: string,
    empresaId: string,
    datos: CrearCajaChica,
    acceso: AccesoCajaChica,
  ): Promise<CajaChicaVista> {
    const caja = await validarCuentaTesoreria(
      this.tx,
      empresaId,
      datos.sucursalId,
      datos.cuentaTesoreriaId,
      acceso,
    );
    if (
      caja.tipo !== "caja" ||
      !caja.cuenta.activa ||
      !caja.cuenta.codigo.startsWith("110102") ||
      (await this.tx.cuenta.count({ where: { empresaId, cuentaPadreId: caja.cuentaId } })) > 0
    ) {
      throw new CuentaCajaChicaInvalidaError(
        "La cuenta de caja chica debe ser una subcuenta activa e imputable de código 110102.",
      );
    }
    const origen = await validarCuentaTesoreria(
      this.tx,
      empresaId,
      datos.sucursalId,
      datos.cuentaOrigenId,
      acceso,
    );
    if (origen.id === caja.id) {
      throw new CuentaCajaChicaInvalidaError("El fondo debe abrirse desde otra cuenta de caja o banco.");
    }

    const id = randomUUID();
    const partidaAperturaId = await crearPartida(
      this.tx,
      usuarioId,
      empresaId,
      datos.sucursalId,
      datos.fecha,
      "Apertura de caja chica",
      "caja_chica_apertura",
      id,
      [
        {
          cuentaId: caja.cuentaId,
          debe: datos.fondoFijo,
          haber: "0.00",
          concepto: "Fondo fijo de caja chica",
        },
        {
          cuentaId: origen.cuentaId,
          debe: "0.00",
          haber: datos.fondoFijo,
          concepto: "Traslado para apertura de caja chica",
        },
      ],
    );

    try {
      await this.tx.cajaChica.create({
        data: {
          id,
          empresaId,
          sucursalId: datos.sucursalId,
          cuentaTesoreriaId: caja.id,
          fondoFijo: datos.fondoFijo,
          partidaAperturaId,
        },
      });
    } catch (error) {
      this.traducir(error, true);
    }
    return this.vista(empresaId, id);
  }

  async registrarVale(empresaId: string, id: string, datos: CrearValeCajaChica): Promise<CajaChicaVista> {
    await validarCuentaGasto(this.tx, empresaId, datos.cuentaGastoId);
    try {
      await this.tx.valeCajaChica.create({
        data: {
          empresaId,
          cajaChicaId: id,
          fecha: new Date(`${datos.fecha}T00:00:00.000Z`),
          comprobante: datos.comprobante,
          concepto: datos.concepto,
          montoNeto: datos.montoNeto,
          iva: datos.iva,
          cuentaGastoId: datos.cuentaGastoId,
        },
      });
    } catch (error) {
      this.traducir(error);
    }
    return this.vista(empresaId, id);
  }

  async reintegrar(
    usuarioId: string,
    empresaId: string,
    id: string,
    datos: ReintegrarCajaChica,
    acceso: AccesoCajaChica,
  ): Promise<CajaChicaVista> {
    const [bloqueada] = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM cajas_chicas WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid FOR UPDATE`;
    if (!bloqueada) throw new CajaChicaNoEncontradaError();

    const caja = await this.tx.cajaChica.findFirst({
      where: { id, empresaId },
      include: { cuentaTesoreria: { include: { cuenta: true } } },
    });
    if (!caja) throw new CajaChicaNoEncontradaError();
    const vales = await this.tx.valeCajaChica.findMany({
      where: { empresaId, cajaChicaId: id, estado: "por_reintegrar" },
      orderBy: [{ cuentaGastoId: "asc" }, { fecha: "asc" }, { creadoEn: "asc" }],
    });
    if (vales.length === 0) throw new SinValesPorReintegrarError();

    const origen = await validarCuentaTesoreria(
      this.tx,
      empresaId,
      caja.sucursalId,
      datos.cuentaOrigenId,
      acceso,
    );
    if (origen.id === caja.cuentaTesoreriaId) {
      throw new CuentaCajaChicaInvalidaError("El reintegro debe salir de otra cuenta de caja o banco.");
    }

    const gastoPorCuenta = new Map<string, Dinero>();
    for (const vale of vales) {
      await validarCuentaGasto(this.tx, empresaId, vale.cuentaGastoId);
      const importe = Dinero.de(vale.montoNeto.toFixed(2));
      gastoPorCuenta.set(
        vale.cuentaGastoId,
        (gastoPorCuenta.get(vale.cuentaGastoId) ?? Dinero.cero()).mas(importe),
      );
    }
    const iva = Dinero.sumar(vales.map((vale) => vale.iva.toFixed(2)));
    const neto = Dinero.sumar(vales.map((vale) => vale.montoNeto.toFixed(2)));
    const total = neto.mas(iva);

    const lineas: Linea[] = [...gastoPorCuenta.entries()].map(([cuentaId, monto]) => ({
      cuentaId,
      debe: monto.aTexto(),
      haber: "0.00",
      concepto: "Gastos de caja chica",
    }));
    if (!iva.esCero()) {
      lineas.push({
        cuentaId: await validarCuentaIva(this.tx, empresaId),
        debe: iva.aTexto(),
        haber: "0.00",
        concepto: "Crédito Fiscal IVA de caja chica",
      });
    }
    lineas.push({
      cuentaId: origen.cuentaId,
      debe: "0.00",
      haber: total.aTexto(),
      concepto: "Reintegro de caja chica",
    });

    const partidaId = await crearPartida(
      this.tx,
      usuarioId,
      empresaId,
      caja.sucursalId,
      datos.fecha,
      "Reintegro de caja chica",
      "caja_chica_reintegro",
      id,
      lineas,
    );
    const actualizados = await this.tx.valeCajaChica.updateMany({
      where: {
        empresaId,
        cajaChicaId: id,
        estado: "por_reintegrar",
        id: { in: vales.map((vale) => vale.id) },
      },
      data: { estado: "reintegrado", partidaReintegroId: partidaId },
    });
    if (actualizados.count !== vales.length) {
      throw new ReglaCajaChicaError("Los vales cambiaron durante el reintegro. Vuelve a intentarlo.");
    }
    return this.vista(empresaId, id);
  }

  private async vista(empresaId: string, id: string): Promise<CajaChicaVista> {
    const fila = await this.tx.cajaChica.findFirst({ where: { id, empresaId }, include: incluirCaja });
    if (!fila) throw new CajaChicaNoEncontradaError();
    return aVista(fila);
  }

  private traducir(error: unknown, esApertura = false): never {
    if (esApertura) {
      const indice = indiceDuplicado(error);
      if (indice === "sucursal") throw new CajaChicaDuplicadaError();
      if (indice === "cuenta") {
        throw new CuentaCajaChicaInvalidaError("La cuenta de tesorería ya está asignada a otra caja chica.");
      }
    }
    const regla = mensajeDeRegla(error);
    if (regla) throw new ReglaCajaChicaError(regla);
    throw error;
  }
}

@Injectable()
export class RepositorioCajaChicaPrisma implements RepositorioCajaChica {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadCajaChica) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrismaCajaChica(tx)));
  }
}
