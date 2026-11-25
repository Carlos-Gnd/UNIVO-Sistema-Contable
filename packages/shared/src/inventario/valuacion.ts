import Decimal from "decimal.js";
import type { MetodoValuacion } from "../esquemas/enums";

// Configuración propia para no alterar la instancia global de decimal.js
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Redondea un valor monetario al centavo (medio hacia arriba). */
const centavos = (valor: Decimal) => valor.toDecimalPlaces(2);

/** Se pidió sacar más unidades de las que hay en existencia. */
export class ExistenciaInsuficienteError extends Error {
  constructor(
    readonly disponible: string,
    readonly solicitada: string,
  ) {
    super(`Existencia insuficiente: hay ${disponible} y se piden ${solicitada}.`);
  }
}

export type MetodoValuacionKardex = MetodoValuacion | "especifico";

interface Capa {
  cantidad: Decimal;
  /** Valor total de la capa en dólares, al centavo */
  total: Decimal;
}

export interface SaldoExistencias {
  cantidad: string;
  /** Valor total de las existencias, con dos decimales */
  costoTotal: string;
  /** Costo promedio por unidad, con cuatro decimales (0.0000 sin existencias) */
  costoUnitario: string;
}

/**
 * Existencias de un producto en una sucursal con su valuación (HU-65). Todo se calcula con decimales exactos y
 * los valores se redondean al centavo. Cuando una salida agota una capa (o las existencias), se lleva el valor
 * restante completo: así los centavos de redondeo nunca se pierden ni sobran.
 *
 * - Promedio ponderado: una sola capa; cada entrada se suma y cada salida sale al costo promedio vigente.
 * - PEPS (primeras entradas, primeras salidas): una capa por entrada; las salidas consumen las más antiguas.
 */
export class ExistenciasProducto {
  private capas: Capa[] = [];

  constructor(readonly metodo: MetodoValuacionKardex) {}

  /** Registra una entrada con su valor total (cantidad por costo unitario, ya redondeado al centavo). */
  entrada(cantidad: string, costoTotal: string): void {
    const cant = new D(cantidad);
    if (!cant.isFinite() || cant.lte(0))
      throw new Error("La cantidad de una entrada debe ser mayor que cero.");
    const total = centavos(new D(costoTotal));
    if (total.isNegative()) throw new Error("El costo de una entrada no puede ser negativo.");
    if ((this.metodo === "promedio_ponderado" || this.metodo === "especifico") && this.capas[0]) {
      this.capas[0].cantidad = this.capas[0].cantidad.plus(cant);
      this.capas[0].total = this.capas[0].total.plus(total);
    } else {
      this.capas.push({ cantidad: cant, total });
    }
  }

  /** Saca unidades y devuelve su costo total al centavo. */
  salida(cantidad: string): string {
    if (this.metodo === "especifico") {
      throw new Error("El costo específico requiere elegir las series que salen.");
    }
    const pedida = new D(cantidad);
    if (!pedida.isFinite() || pedida.lte(0))
      throw new Error("La cantidad de una salida debe ser mayor que cero.");
    const disponible = this.existencia();
    if (pedida.gt(disponible))
      throw new ExistenciaInsuficienteError(disponible.toFixed(4), pedida.toFixed(4));

    let faltante = pedida;
    let costo = new D(0);
    while (faltante.gt(0)) {
      const capa = this.capas[0]!;
      const toma = Decimal.min(faltante, capa.cantidad);
      const parte = toma.eq(capa.cantidad)
        ? capa.total
        : centavos(capa.total.times(toma).dividedBy(capa.cantidad));
      capa.cantidad = capa.cantidad.minus(toma);
      capa.total = capa.total.minus(parte);
      costo = costo.plus(parte);
      faltante = faltante.minus(toma);
      if (capa.cantidad.isZero()) this.capas.shift();
    }
    return costo.toFixed(2);
  }

  /** Saca unidades seriadas usando el valor contable de las series seleccionadas. */
  salidaEspecifica(cantidad: string, costoTotal: string): string {
    if (this.metodo !== "especifico")
      throw new Error("El costo específico solo aplica a productos controlados por serie.");
    const pedida = new D(cantidad);
    if (!pedida.isFinite() || pedida.lte(0))
      throw new Error("La cantidad de una salida debe ser mayor que cero.");
    const disponible = this.existencia();
    if (pedida.gt(disponible))
      throw new ExistenciaInsuficienteError(disponible.toFixed(4), pedida.toFixed(4));

    const capa = this.capas[0]!;
    const costo = centavos(new D(costoTotal));
    if (!costo.isFinite() || costo.isNegative() || costo.gt(capa.total)) {
      throw new Error("El costo de las series supera el valor de las existencias.");
    }
    const valor = pedida.eq(disponible) ? capa.total : costo;
    if (pedida.eq(disponible) && !valor.eq(costo)) {
      throw new Error("El costo de las series no coincide con el valor restante del inventario.");
    }
    capa.cantidad = capa.cantidad.minus(pedida);
    capa.total = capa.total.minus(valor);
    if (capa.cantidad.isZero()) this.capas.shift();
    return valor.toFixed(2);
  }

  private existencia(): Decimal {
    return this.capas.reduce((suma, capa) => suma.plus(capa.cantidad), new D(0));
  }

  saldo(): SaldoExistencias {
    const cantidad = this.existencia();
    const total = this.capas.reduce((suma, capa) => suma.plus(capa.total), new D(0));
    return {
      cantidad: cantidad.toFixed(4),
      costoTotal: total.toFixed(2),
      costoUnitario: cantidad.isZero() ? "0.0000" : total.dividedBy(cantidad).toFixed(4),
    };
  }
}

/** Valor total de una entrada: cantidad por costo unitario, redondeado al centavo. */
export function costoTotalDeEntrada(cantidad: string, costoUnitario: string): string {
  return centavos(new D(cantidad).times(new D(costoUnitario))).toFixed(2);
}

/** Distribuye al centavo el valor de una entrada entre sus unidades, llevando el residuo a la última serie. */
export function distribuirCostoPorUnidad(costoTotal: string, unidades: number): string[] {
  if (!Number.isSafeInteger(unidades) || unidades < 1)
    throw new Error("Se necesita al menos una unidad seriada.");
  const total = centavos(new D(costoTotal));
  const base = total.dividedBy(unidades).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const resto = total.minus(base.times(unidades - 1));
  return Array.from({ length: unidades }, (_, i) => (i === unidades - 1 ? resto : base).toFixed(2));
}

/** Suma los costos contables de las series y redondea el total al centavo. */
export function costoTotalDeSeries(costos: readonly string[]): string {
  return centavos(costos.reduce((total, costo) => total.plus(new D(costo)), new D(0))).toFixed(2);
}

/** Costo unitario de un movimiento, con cuatro decimales y sin conversiones monetarias a number. */
export function costoUnitarioDeTotal(costoTotal: string, cantidad: string): string {
  return new D(costoTotal).dividedBy(new D(cantidad)).toFixed(4);
}

export interface MovimientoParaKardex {
  id: string;
  fecha: string;
  tipo: "entrada" | "salida";
  cantidad: string;
  /** Solo en entradas; el costo de las salidas lo calcula la valuación */
  costoTotal: string;
  referencia: string | null;
}

export interface DetalleKardex {
  cantidad: string;
  costoUnitario: string;
  costoTotal: string;
}

export interface LineaKardex {
  id: string;
  fecha: string;
  referencia: string | null;
  entrada: DetalleKardex | null;
  salida: DetalleKardex | null;
  saldo: SaldoExistencias;
}

export interface ResultadoKardex {
  saldoInicial: SaldoExistencias;
  lineas: LineaKardex[];
  totales: { entradaCantidad: string; entradaTotal: string; salidaCantidad: string; salidaTotal: string };
  saldoFinal: SaldoExistencias;
}

const unitario = (total: string, cantidad: string) => new D(total).dividedBy(new D(cantidad)).toFixed(4);

/**
 * Kardex de un producto: reproduce en orden todos los movimientos para valuar cada salida con el método elegido
 * y presenta solo los del rango [desde, hasta]; los anteriores forman el saldo inicial. Los movimientos deben
 * venir ordenados por fecha y secuencia.
 */
export function armarKardex(
  movimientos: readonly MovimientoParaKardex[],
  metodo: MetodoValuacionKardex,
  rango: { desde?: string | undefined; hasta?: string | undefined } = {},
): ResultadoKardex {
  const existencias = new ExistenciasProducto(metodo);
  // Sin fecha inicial, el kardex parte de cero; con ella, del saldo que había antes del primer movimiento del rango
  let saldoInicial: SaldoExistencias | null = rango.desde ? null : existencias.saldo();
  const lineas: LineaKardex[] = [];
  let entradaCantidad = new D(0);
  let entradaTotal = new D(0);
  let salidaCantidad = new D(0);
  let salidaTotal = new D(0);

  for (const m of movimientos) {
    if (rango.hasta && m.fecha > rango.hasta) break;
    if (rango.desde && m.fecha >= rango.desde && saldoInicial === null) saldoInicial = existencias.saldo();

    let costo: string;
    if (m.tipo === "entrada") {
      existencias.entrada(m.cantidad, m.costoTotal);
      costo = new D(m.costoTotal).toFixed(2);
    } else {
      costo =
        metodo === "especifico"
          ? existencias.salidaEspecifica(m.cantidad, m.costoTotal)
          : existencias.salida(m.cantidad);
    }
    if (rango.desde && m.fecha < rango.desde) continue;

    const detalle: DetalleKardex = {
      cantidad: new D(m.cantidad).toFixed(4),
      costoUnitario: unitario(costo, m.cantidad),
      costoTotal: costo,
    };
    if (m.tipo === "entrada") {
      entradaCantidad = entradaCantidad.plus(m.cantidad);
      entradaTotal = entradaTotal.plus(costo);
    } else {
      salidaCantidad = salidaCantidad.plus(m.cantidad);
      salidaTotal = salidaTotal.plus(costo);
    }
    lineas.push({
      id: m.id,
      fecha: m.fecha,
      referencia: m.referencia,
      entrada: m.tipo === "entrada" ? detalle : null,
      salida: m.tipo === "salida" ? detalle : null,
      saldo: existencias.saldo(),
    });
  }

  return {
    saldoInicial: saldoInicial ?? existencias.saldo(),
    lineas,
    totales: {
      entradaCantidad: entradaCantidad.toFixed(4),
      entradaTotal: entradaTotal.toFixed(2),
      salidaCantidad: salidaCantidad.toFixed(4),
      salidaTotal: salidaTotal.toFixed(2),
    },
    saldoFinal: existencias.saldo(),
  };
}
