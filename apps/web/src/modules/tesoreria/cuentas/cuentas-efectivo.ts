import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";

/** Subcuentas de efectivo (1101…) de último nivel que todavía no tienen caja o banco. */
export function cuentasDeEfectivoLibres(catalogo: readonly CuentaCatalogo[], usadas: ReadonlySet<string>) {
  const conHijas = new Set(catalogo.map((c) => c.cuentaPadreId).filter(Boolean));
  return catalogo
    .filter((c) => c.activa && /^1101./.test(c.codigo) && !conHijas.has(c.id) && !usadas.has(c.id))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}
