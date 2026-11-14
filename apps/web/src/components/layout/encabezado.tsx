import type { ReactNode } from "react";

interface EncabezadoProps {
  /** Sección del menú en la que está el usuario */
  seccion?: string;
  /** Lado izquierdo, antes de la sección (por ejemplo, el botón del menú en el celular) */
  inicio?: ReactNode;
  /** Lado derecho: selector de empresa y sucursal (S1-T51), logotipo (S1-T42) y sesión */
  children?: ReactNode;
}

/** Barra superior de las pantallas del sistema (S1-T26). */
export function Encabezado({ seccion, inicio, children }: EncabezadoProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-6 backdrop-blur supports-backdrop-filter:bg-background/75">
      {inicio}
      {seccion && <p className="truncate text-sm font-semibold text-foreground">{seccion}</p>}
      <div data-slot="acciones-encabezado" className="ml-auto flex min-w-0 items-center gap-2">
        {children}
      </div>
    </header>
  );
}
