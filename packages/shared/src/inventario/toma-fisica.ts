import Decimal from "decimal.js";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Diferencia de cantidades de una toma física, conservando cuatro decimales. */
export function diferenciaCantidadToma(cantidadContada: string, existenciaSistema: string): string {
  return new D(cantidadContada).minus(existenciaSistema).toFixed(4);
}

/** Suma cantidades del inventario sin convertirlas a number. */
export function sumarCantidadesToma(cantidades: readonly string[]): string {
  return cantidades.reduce((total, cantidad) => total.plus(cantidad), new D(0)).toFixed(4);
}

/** Comprueba una cantidad decimal con la misma precisión que el conteo. */
export function cantidadTomaEsCero(cantidad: string): boolean {
  return new D(cantidad).isZero();
}
