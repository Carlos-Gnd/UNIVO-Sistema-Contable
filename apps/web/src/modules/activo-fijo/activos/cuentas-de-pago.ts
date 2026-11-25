import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";

/** Cuentas con las que se puede pagar la compra: efectivo y bancos (1101…) y pasivos (2…), de último nivel. */
export function cuentasDePago(cuentas: readonly CuentaCatalogo[]): CuentaCatalogo[] {
  const padres = new Set(cuentas.map((c) => c.cuentaPadreId).filter(Boolean));
  return cuentas
    .filter((c) => c.activa && !padres.has(c.id) && (c.codigo.startsWith("1101") || c.codigo.startsWith("2")))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}
