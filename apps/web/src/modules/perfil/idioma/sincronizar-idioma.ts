import { useEffect } from "react";
import { cambiarIdioma, esIdioma, hayIdiomaElegido, i18n } from "@/i18n";
import { consultarIdioma, guardarIdioma } from "./idioma-api";

let sincronizadoPara: string | null = null;

/** Solo para las pruebas: permite repetir la sincronización con el mismo usuario. */
export const reiniciarSincronizacionIdioma = () => {
  sincronizadoPara = null;
};

/**
 * Una vez por sesión de usuario junta el idioma del perfil con el de este navegador:
 * - si en este navegador ya se eligió un idioma, ese manda y, si difiere, se guarda en el perfil;
 * - si no se había elegido, se adopta el del perfil (así el idioma sigue al usuario entre dispositivos).
 * Un fallo de red no molesta: el idioma local sigue funcionando.
 */
export function useSincronizarIdioma(usuarioId: string | undefined) {
  useEffect(() => {
    if (!usuarioId || sincronizadoPara === usuarioId) return;
    sincronizadoPara = usuarioId;
    void (async () => {
      try {
        const { idioma: delPerfil } = await consultarIdioma();
        if (!esIdioma(delPerfil)) return;
        if (!hayIdiomaElegido()) {
          if (delPerfil !== i18n.language) await cambiarIdioma(delPerfil);
        } else if (esIdioma(i18n.language) && i18n.language !== delPerfil) {
          await guardarIdioma(i18n.language);
        }
      } catch {
        sincronizadoPara = null;
      }
    })();
  }, [usuarioId]);
}
