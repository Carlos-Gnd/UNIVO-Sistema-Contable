import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";

/** Cuentas activas de costos y gastos que no tienen subcuentas. */
export function cuentasGastoImputables(cuentas: readonly CuentaCatalogo[]): CuentaCatalogo[] {
  const padres = new Set(
    cuentas.map((cuenta) => cuenta.cuentaPadreId).filter((id): id is string => id !== null),
  );
  return cuentas.filter(
    (cuenta) =>
      cuenta.tipo === "costos_gastos" &&
      cuenta.activa &&
      cuenta.imputable !== false &&
      !padres.has(cuenta.id),
  );
}
