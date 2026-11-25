export const CLAVE_AREA_SIN_CLASIFICAR = "__sin_area__";

export interface AreaGastoSinClasificar {
  clave: string;
  etiqueta: string;
}

/** Normaliza las áreas para asignar automáticamente las cuentas Administración y Ventas. */
export function normalizarAreaGasto(area: string | null): string {
  return (area ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-SV");
}

/** Devuelve el código contable de las áreas conocidas, o null para las que requieren elección. */
export function codigoGastoPorArea(area: string | null): "4201" | "4202" | null {
  const normalizada = normalizarAreaGasto(area);
  if (normalizada === "administracion") return "4201";
  if (normalizada === "ventas") return "4202";
  return null;
}

/** Agrupa las áreas cuyo gasto debe asignar manualmente la persona usuaria. */
export function areasSinCuentaAutomatica(areas: readonly (string | null)[]): AreaGastoSinClasificar[] {
  const grupos = new Map<string, AreaGastoSinClasificar>();
  for (const area of areas) {
    if (codigoGastoPorArea(area)) continue;
    const clave = normalizarAreaGasto(area) || CLAVE_AREA_SIN_CLASIFICAR;
    if (!grupos.has(clave)) {
      grupos.set(clave, { clave, etiqueta: area?.trim() || "Sin área" });
    }
  }
  return [...grupos.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es-SV"));
}
