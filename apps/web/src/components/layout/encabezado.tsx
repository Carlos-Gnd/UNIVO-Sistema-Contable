import { Fragment, type ReactNode } from "react";
import { ChevronRight, Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "cn";
import { esMac } from "./atajos";
import { TEXTOS_LAYOUT as T } from "./textos";

interface EncabezadoProps {
  /** Ubicación de la pantalla actual, por ejemplo ["Contabilidad", "Partidas"] */
  ubicacion: readonly string[];
  menuAbierto: boolean;
  /** Lado derecho: empresa y sucursal (S1-T51), período, logotipo (S1-T42) y cuenta del usuario */
  children?: ReactNode;
}

/**
 * Barra superior de las pantallas del sistema (S1-T26): botón del menú principal, ubicación y, a la derecha,
 * el contexto de trabajo. Debe estar dentro del Dialog.Root del layout, que abre el menú.
 */
export function Encabezado({ ubicacion, menuAbierto, children }: EncabezadoProps) {
  const tecla = esMac() ? "⌘" : "Ctrl";
  const accion = menuAbierto ? T.menu.cerrar : T.menu.abrir;
  return (
    <header
      className={cn(
        "sticky top-0 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-5",
        // Con el menú abierto queda sobre el fondo oscuro, para cerrar el menú con el mismo botón
        menuAbierto ? "z-[61]" : "z-40",
      )}
    >
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={accion}
          title={`${accion} ${T.menu.atajo(tecla)}`}
          aria-keyshortcuts={esMac() ? "Meta+K" : "Control+K"}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            menuAbierto
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-secondary",
          )}
        >
          {menuAbierto ? (
            <X className="size-[18px]" aria-hidden />
          ) : (
            <Menu className="size-[18px]" aria-hidden />
          )}
        </button>
      </DialogPrimitive.Trigger>

      <nav
        aria-label={T.ubicacion}
        className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
      >
        {ubicacion.map((parte, indice) =>
          indice < ubicacion.length - 1 ? (
            <Fragment key={parte}>
              <span className="flex items-center gap-1.5">
                {parte}
                <ChevronRight className="size-3.5 text-muted-foreground/70" aria-hidden />
              </span>
            </Fragment>
          ) : (
            <b key={parte} aria-current="page" className="truncate font-semibold text-foreground">
              {parte}
            </b>
          ),
        )}
      </nav>

      <div data-slot="acciones-encabezado" className="ml-auto flex min-w-0 items-center gap-2">
        {children}
      </div>
    </header>
  );
}
