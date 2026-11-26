import Decimal from "decimal.js";
import type { Monto } from "./dinero";
import { Dinero } from "./dinero";

const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/**
 * Variación porcentual de un monto frente a su base: (actual − base) / |base| × 100, con dos decimales
 * ("12.50"). Sin base (cero) no hay porcentaje que calcular y devuelve null. El valor absoluto de la base
 * mantiene el sentido de la variación cuando la base es negativa (por ejemplo, una pérdida).
 */
export function variacionPorcentual(actual: Monto, base: Monto): string | null {
  const b = Dinero.de(base);
  if (b.esCero()) return null;
  const diferencia = new D(Dinero.de(actual).menos(b).aTexto());
  return diferencia.dividedBy(new D(b.abs().aTexto())).times(100).toDecimalPlaces(2).toFixed(2);
}
