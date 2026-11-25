import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearVenta, DocumentoComercialResumen, DocumentoComercialVista } from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
export const claveVentas = (empresaId: string) => ["empresas", empresaId, "ventas"] as const;

export interface FiltrosVentas {
  busqueda: string;
  desde: string;
  hasta: string;
}

/** Ventas de la empresa; los filtros los resuelve la API. */
export const ventasQuery = (empresaId: string, filtros: FiltrosVentas) => {
  const q = new URLSearchParams();
  if (filtros.busqueda.trim()) q.set("busqueda", filtros.busqueda.trim());
  if (filtros.desde) q.set("desde", filtros.desde);
  if (filtros.hasta) q.set("hasta", filtros.hasta);
  const texto = q.toString();
  return queryOptions({
    queryKey: [...claveVentas(empresaId), "lista", filtros] as const,
    queryFn: ({ signal }) =>
      api<DocumentoComercialResumen[]>(`${base(empresaId)}/ventas${texto ? `?${texto}` : ""}`, {
        senal: signal,
      }),
  });
};

export const ventaQuery = (empresaId: string, documentoId: string) =>
  queryOptions({
    queryKey: [...claveVentas(empresaId), "detalle", documentoId] as const,
    queryFn: ({ signal }) =>
      api<DocumentoComercialVista>(`${base(empresaId)}/ventas/${encodeURIComponent(documentoId)}`, {
        senal: signal,
      }),
  });

/** Registrar una venta mueve el kardex y crea dos partidas: se refrescan también los productos y el kardex. */
export function useRegistrarVenta(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearVenta) =>
      api<DocumentoComercialVista>(`${base(empresaId)}/ventas`, { metodo: "POST", cuerpo: datos }),
    onSuccess: async () => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: claveVentas(empresaId) }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "inventario"] }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "partidas"] }),
      ]);
    },
  });
}
