import { useSyncExternalStore } from "react";

/** Cambia de pantalla sin recargar; App escucha popstate para mostrar la nueva ruta. */
export function navegar(ruta: string, { reemplazar = false }: { reemplazar?: boolean } = {}): void {
  if (reemplazar) window.history.replaceState(null, "", ruta);
  else window.history.pushState(null, "", ruta);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function suscribir(avisar: () => void) {
  window.addEventListener("popstate", avisar);
  return () => window.removeEventListener("popstate", avisar);
}

/** Ruta actual (pathname) que se actualiza al navegar o con los botones atrás y adelante del navegador. */
export function useRutaActual(): string {
  return useSyncExternalStore(
    suscribir,
    () => window.location.pathname,
    () => "/",
  );
}
