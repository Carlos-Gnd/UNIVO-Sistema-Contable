import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useAtajosMenu } from "./atajos";
import { Encabezado } from "./encabezado";
import { MenuPrincipal } from "./menu-principal";
import { gruposVisibles, opcionActiva } from "./opciones-menu";
import { TEXTOS_LAYOUT as T } from "./textos";

interface LayoutPrincipalProps {
  /** Ruta actual, para la ubicación del encabezado y la opción resaltada del menú */
  ruta: string;
  /** Empresa activa; sin ella el menú no tiene opciones (por ejemplo, al registrar la primera empresa) */
  empresaId?: string;
  children: ReactNode;
}

/**
 * Estructura común de las pantallas del sistema, según el prototipo de interfaz (S1-T26, HU-04): encabezado con
 * el botón del menú principal y la ubicación, contenido y pie con la versión.
 * Adaptable (S1-T27), con los mismos cortes del prototipo: el menú muestra sus grupos en tres columnas en
 * computadora (desde 1024 px), dos en tableta y una en celular, donde ocupa todo el ancho, el encabezado es más
 * bajo, la ubicación solo muestra la pantalla actual y se oculta la ayuda de teclado.
 * Con empresa, debe usarse dentro de <PermisosProvider>: el menú solo muestra las opciones permitidas.
 */
export function LayoutPrincipal({ ruta, empresaId, children }: LayoutPrincipalProps) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);
  useAtajosMenu(menuAbierto, setMenuAbierto);

  // La ubicación no depende de permisos: si el usuario está en la pantalla, es la suya
  const activa = useMemo(
    () => (empresaId ? opcionActiva(ruta, gruposVisibles(empresaId)) : null),
    [ruta, empresaId],
  );
  const ubicacion = activa ? [activa.grupo.titulo, activa.opcion.etiqueta] : [T.marca];

  return (
    // No modal: el botón del encabezado queda activo para cerrar el menú, como en el prototipo
    <DialogPrimitive.Root open={menuAbierto} onOpenChange={setMenuAbierto} modal={false}>
      <div className="layout-principal flex min-h-screen flex-1 flex-col">
        <Encabezado ubicacion={ubicacion} menuAbierto={menuAbierto} />
        <MenuPrincipal idActiva={activa?.opcion.id} empresaId={empresaId} onNavegar={cerrarMenu} />
        <main className="pantalla-modulo flex-1">{children}</main>
        <footer className="app-footer">v{__APP_VERSION__}</footer>
      </div>
    </DialogPrimitive.Root>
  );
}
