import type { Tx } from "@contable/db";
import { areasSinCuentaAutomatica, codigoGastoPorArea } from "@contable/shared";
import type { CuentaParaPlanilla } from "../domain/calculo-planilla.js";

/** Valida las cuentas automáticas y las que la persona asigna a áreas no clasificadas. */
export async function leerCuentasGastoPorArea(
  tx: Tx,
  empresaId: string,
  areas: readonly (string | null)[],
  asignaciones: readonly { clave: string; cuentaGastoId: string }[],
  cuentasPorCodigo: ReadonlyMap<string, CuentaParaPlanilla>,
  errorCuenta: (codigo?: string) => Error,
): Promise<Map<string, CuentaParaPlanilla>> {
  const resultado = new Map<string, CuentaParaPlanilla>();
  const codigosAutomaticos = new Set(
    areas.map(codigoGastoPorArea).filter((codigo): codigo is "4201" | "4202" => codigo !== null),
  );
  for (const codigo of codigosAutomaticos) {
    const cuenta = cuentasPorCodigo.get(codigo);
    if (!cuenta?.activa || !cuenta.imputable) throw errorCuenta(codigo);
  }

  const porClave = new Map(asignaciones.map(({ clave, cuentaGastoId }) => [clave, cuentaGastoId]));
  const areasManuales = areasSinCuentaAutomatica(areas);
  if (areasManuales.length === 0) return resultado;

  const ids = areasManuales.map((area) => {
    const id = porClave.get(area.clave);
    if (!id) throw errorCuenta();
    return id;
  });
  const cuentasManuales = await tx.$queryRaw<CuentaParaPlanilla[]>`
    SELECT c.id::text, c.codigo, c.nombre, c.activa,
           NOT EXISTS (
             SELECT 1 FROM cuentas h
             WHERE h.empresa_id = c.empresa_id AND h.cuenta_padre_id = c.id
           ) AS imputable
    FROM cuentas c
    WHERE c.empresa_id = ${empresaId}::uuid
      AND c.id = ANY(${ids}::uuid[])
      AND c.activa
      AND c.tipo = 'costos_gastos'
      AND c.codigo LIKE '42%'
  `;
  const porId = new Map(cuentasManuales.map((cuenta) => [cuenta.id, cuenta]));
  for (const [indice, area] of areasManuales.entries()) {
    const cuenta = porId.get(ids[indice]!);
    if (!cuenta?.imputable) throw errorCuenta(cuenta?.codigo);
    resultado.set(area.clave, cuenta);
  }
  return resultado;
}
