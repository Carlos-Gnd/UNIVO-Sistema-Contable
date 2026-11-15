import { RUTAS, resolverRuta, type DefinicionRuta } from "@/app/rutas";

/** Ruta a la que llevan los enlaces de invitación y de recuperación (la misma que usa la API al invitar). */
export const RUTA_CAMBIAR_CONTRASENA = "/cambiar-contrasena";

/** Pantalla para registrar la primera empresa: a donde llega quien todavía no ha abierto ninguna. */
export const RUTA_SIN_EMPRESA = "/empresas/nueva";

const claveUltimaRuta = (usuarioId: string) => `ultimaRuta:${usuarioId}`;

/** Recuerda la última pantalla que abrió el usuario en este navegador, para volver a ella al iniciar sesión. */
export function recordarRuta(usuarioId: string, ruta: string): void {
  try {
    localStorage.setItem(claveUltimaRuta(usuarioId), ruta);
  } catch {
    // Sin almacenamiento (modo privado): al iniciar sesión llegará a la pantalla por defecto
  }
}

/** Pantalla a la que llega el usuario al iniciar sesión: la última que abrió, si todavía existe. */
export function rutaInicial(usuarioId: string, rutas: readonly DefinicionRuta[] = RUTAS): string {
  let guardada: string | null;
  try {
    guardada = localStorage.getItem(claveUltimaRuta(usuarioId));
  } catch {
    guardada = null;
  }
  return guardada && resolverRuta(guardada, rutas) ? guardada : RUTA_SIN_EMPRESA;
}
