import { useCallback, useEffect, useState } from "react";
import { Menu, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { MenuLateral } from "./menu-lateral";
import { TEXTOS_LAYOUT as T } from "./textos";

/** Desde este ancho se ve la barra lateral fija y el panel deja de hacer falta (md de Tailwind). */
const CONSULTA_BARRA_FIJA = "(min-width: 768px)";

/** Cierra el panel si la pantalla crece hasta mostrar la barra fija (por ejemplo, al girar la tableta). */
function useCerrarConBarraFija(cerrar: () => void) {
  useEffect(() => {
    const consulta = window.matchMedia?.(CONSULTA_BARRA_FIJA);
    if (!consulta) return;
    const alCambiar = (evento: MediaQueryListEvent) => evento.matches && cerrar();
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, [cerrar]);
}

/** Botón del encabezado que abre el menú en un panel deslizable; solo en celulares (S1-T27). */
export function PanelMenu({ ruta, empresaId }: { ruta: string; empresaId?: string }) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);
  useCerrarConBarraFija(cerrar);

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={setAbierto}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon-lg" className="-ml-2 md:hidden" aria-label={T.menu.abrir}>
          <Menu className="size-5" aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left md:hidden"
        >
          <DialogPrimitive.Title className="sr-only">{T.menu.etiqueta}</DialogPrimitive.Title>
          <MenuLateral ruta={ruta} empresaId={empresaId} variante="panel" onNavegar={cerrar} />
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              className="absolute top-3.5 right-3"
              aria-label={T.menu.cerrar}
            >
              <XIcon className="size-5" aria-hidden />
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
