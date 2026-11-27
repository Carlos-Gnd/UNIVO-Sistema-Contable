import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Preferencia del modo didáctico del usuario autenticado (HU-89). */
export const modoDidacticoQuery = () =>
  queryOptions({
    queryKey: ["usuarios", "me", "modo-didactico"] as const,
    queryFn: ({ signal }) => api<{ activo: boolean }>("/usuarios/me/modo-didactico", { senal: signal }),
    staleTime: 5 * 60_000,
  });

export const guardarModoDidactico = (activo: boolean) =>
  api<{ activo: boolean }>("/usuarios/me/modo-didactico", { metodo: "PATCH", cuerpo: { activo } });
