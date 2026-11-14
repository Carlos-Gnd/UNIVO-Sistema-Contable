import { useMemo, type ReactNode } from "react";
import { Encabezado } from "./encabezado";
import { MenuLateral } from "./menu-lateral";
import { gruposVisibles, opcionActiva } from "./opciones-menu";

interface LayoutPrincipalProps {
  /** Ruta actual, para marcar la opción activa del menú */
  ruta: string;
  /** Empresa activa; sin ella el menú no tiene opciones (por ejemplo, al registrar la primera empresa) */
  empresaId?: string;
  children: ReactNode;
}

/**
 * Estructura común de las pantallas del sistema: menú lateral, encabezado y contenido (S1-T26, HU-04).
 * Con empresa, debe usarse dentro de <PermisosProvider>: el menú solo muestra las opciones permitidas.
 */
export function LayoutPrincipal({ ruta, empresaId, children }: LayoutPrincipalProps) {
  // La sección del encabezado no depende de permisos: si el usuario está en la pantalla, es la suya
  const seccion = useMemo(
    () => (empresaId ? opcionActiva(ruta, gruposVisibles(empresaId))?.etiqueta : undefined),
    [ruta, empresaId],
  );

  return (
    <div className="layout-principal flex min-h-screen flex-1">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <MenuLateral ruta={ruta} empresaId={empresaId} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado seccion={seccion} />
        <main className="pantalla-modulo flex-1">{children}</main>
        <footer className="app-footer">v{__APP_VERSION__}</footer>
      </div>
    </div>
  );
}
