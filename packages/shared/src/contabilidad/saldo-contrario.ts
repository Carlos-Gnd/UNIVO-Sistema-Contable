import { Dinero, type Monto } from "../dinero/dinero";
import type { Naturaleza } from "../esquemas/enums";

/** Indica si el saldo neto de una cuenta está en el lado contrario a su naturaleza contable. */
export function saldoContrarioANaturaleza(naturaleza: Naturaleza, saldoNeto: Monto): boolean {
  const saldo = Dinero.de(saldoNeto);
  if (saldo.esCero()) return false;
  return naturaleza === "deudora" ? saldo.esNegativo() : !saldo.esNegativo();
}
