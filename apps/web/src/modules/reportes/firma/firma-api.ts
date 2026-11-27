import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EstadoFirmadoVista, FirmarEstado } from "@contable/shared";
import { api, apiArchivo } from "@/lib/api";
import { descargarArchivo } from "@/lib/descargas";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/estados-firmados`;
const clave = (empresaId: string) => ["empresas", empresaId, "estados-firmados"] as const;

/** Estados firmados de la empresa, del más reciente al más antiguo (GET, permiso estados.ver). */
export const estadosFirmadosQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<EstadoFirmadoVista[]>(base(empresaId), { senal: signal }),
  });

/** Firma el estado (POST, permiso estados.firmar) y devuelve la firma con su código de verificación. */
export function useFirmarEstado(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (estado: FirmarEstado) =>
      api<EstadoFirmadoVista>(base(empresaId), { metodo: "POST", cuerpo: estado }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

/** Descarga el PDF firmado: la API lo guarda tal como se firmó, así que la huella coincide siempre. */
export async function descargarPdfFirmado(empresaId: string, firma: EstadoFirmadoVista): Promise<void> {
  const archivo = await apiArchivo(`${base(empresaId)}/${encodeURIComponent(firma.id)}/pdf`);
  descargarArchivo(archivo.contenido, archivo.nombre ?? `${firma.codigoVerificacion}.pdf`);
}
