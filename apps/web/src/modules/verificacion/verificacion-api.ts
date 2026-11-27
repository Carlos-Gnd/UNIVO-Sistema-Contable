import { queryOptions, useMutation } from "@tanstack/react-query";
import type { VerificacionEstado } from "@contable/shared";
import { api } from "@/lib/api";

/** Rutas públicas de la API (HU-88): no piden sesión y se limitan por IP. */
const ruta = (codigo: string) => `/verificacion/${encodeURIComponent(codigo)}`;

export const verificacionQuery = (codigo: string) =>
  queryOptions({
    queryKey: ["verificacion", codigo] as const,
    queryFn: ({ signal }) => api<VerificacionEstado>(ruta(codigo), { senal: signal }),
    retry: false,
    staleTime: 60_000,
  });

/** Sube el PDF (campo `archivo`) para comprobar que su huella y su firma son las del documento firmado. */
export function useComprobarPdf(codigo: string) {
  return useMutation({
    mutationFn: (archivo: File) => {
      const datos = new FormData();
      datos.append("archivo", archivo);
      return api<VerificacionEstado>(ruta(codigo), { metodo: "POST", cuerpo: datos });
    },
  });
}
