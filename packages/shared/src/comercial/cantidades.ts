import Decimal from "decimal.js";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Resta de cantidades de inventario (hasta cuatro decimales) sin pasar por number. */
export function restarCantidades(a: string, b: string): string {
  return new D(a).minus(b).toFixed(4);
}

/** Verdadero si la cantidad `a` es mayor que `b`. */
export function cantidadMayor(a: string, b: string): boolean {
  return new D(a).greaterThan(b);
}

/** Verdadero si ambas cantidades son iguales. */
export function cantidadIgual(a: string, b: string): boolean {
  return new D(a).equals(b);
}
