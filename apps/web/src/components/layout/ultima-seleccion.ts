const CLAVE_ULTIMA_SELECCION = "contable:ultima-seleccion";

export interface UltimaSeleccion {
  empresaId: string;
  sucursalId: string | null;
}

/** Lee la última selección guardada; los datos locales pueden estar ausentes o dañados. */
export function leerUltimaSeleccion(): UltimaSeleccion | null {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(CLAVE_ULTIMA_SELECCION) ?? "null");
    if (
      typeof valor !== "object" ||
      valor === null ||
      !("empresaId" in valor) ||
      typeof valor.empresaId !== "string" ||
      !valor.empresaId ||
      !("sucursalId" in valor) ||
      !(typeof valor.sucursalId === "string" || valor.sucursalId === null)
    ) {
      return null;
    }
    return { empresaId: valor.empresaId, sucursalId: valor.sucursalId };
  } catch {
    return null;
  }
}

/** Guarda solo los identificadores; los datos de empresa y sucursal siempre se consultan a la API. */
export function guardarUltimaSeleccion(seleccion: UltimaSeleccion): void {
  try {
    localStorage.setItem(CLAVE_ULTIMA_SELECCION, JSON.stringify(seleccion));
  } catch {
    // El selector sigue funcionando aunque el navegador bloquee el almacenamiento local.
  }
}
