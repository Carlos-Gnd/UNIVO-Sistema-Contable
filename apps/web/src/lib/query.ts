import { QueryClient } from "@tanstack/react-query";
import { ErrorApi } from "@/lib/api";

/** Los errores 4xx (permiso, validación, no encontrado) no se reintentan: repetirlos no cambia el resultado. */
function reintentar(intentos: number, error: unknown): boolean {
  if (error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) return false;
  return intentos < 2;
}

export function crearClienteQuery(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: reintentar, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
