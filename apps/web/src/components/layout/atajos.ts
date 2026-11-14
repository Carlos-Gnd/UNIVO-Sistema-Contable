import { useEffect } from "react";

/** En Mac el atajo del menú es ⌘ K; en los demás sistemas, Ctrl K. */
export const esMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const enCampoDeTexto = (elemento: EventTarget | null) =>
  elemento instanceof HTMLElement &&
  (elemento.isContentEditable || elemento.closest("input, textarea, select") !== null);

/**
 * Atajos del menú principal, como en el prototipo:
 * Ctrl K (⌘ K en Mac) abre o cierra el menú; «/» lo abre desde cualquier pantalla, salvo al escribir en un campo
 * o con otro diálogo abierto.
 */
export function useAtajosMenu(abierto: boolean, setAbierto: (abierto: boolean) => void) {
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        setAbierto(!abierto);
      } else if (
        evento.key === "/" &&
        !abierto &&
        !enCampoDeTexto(evento.target) &&
        !document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) {
        evento.preventDefault();
        setAbierto(true);
      }
    }
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, [abierto, setAbierto]);
}
