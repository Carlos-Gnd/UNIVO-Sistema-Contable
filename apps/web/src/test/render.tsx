import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { PermisosFijos, type CodigoPermiso, type Rol } from "@/modules/organizacion/permisos";

interface OpcionesRender extends Omit<RenderOptions, "wrapper"> {
  /** Permisos concedidos; por defecto ninguno */
  permisos?: readonly CodigoPermiso[];
  rol?: Rol | null;
  todasSucursales?: boolean;
  sucursales?: readonly string[];
}

export function crearClientePruebas(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

/** Renderiza con React Query y permisos fijos, y devuelve también un userEvent listo para usar. */
export function renderizar(
  ui: ReactElement,
  { permisos = [], rol = null, todasSucursales = true, sucursales = [], ...opciones }: OpcionesRender = {},
): RenderResult & { usuario: UserEvent; cliente: QueryClient } {
  const cliente = crearClientePruebas();
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>
      <PermisosFijos permisos={permisos} rol={rol} todasSucursales={todasSucursales} sucursales={sucursales}>
        {children}
      </PermisosFijos>
    </QueryClientProvider>
  );
  return {
    // Sin pausa entre teclas (delay: null): con la máquina cargada, esperar un ciclo de eventos por tecla hacía
    // que escribir un NIT tardara varios segundos y las pruebas superaban el límite de tiempo
    usuario: userEvent.setup({ delay: null }),
    cliente,
    ...render(ui, { wrapper: Envoltura, ...opciones }),
  };
}
