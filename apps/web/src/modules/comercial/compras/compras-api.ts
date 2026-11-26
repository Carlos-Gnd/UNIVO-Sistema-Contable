import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearCompra, DocumentoComercialResumen, DocumentoComercialVista } from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
export const claveCompras = (empresaId: string) => ["empresas", empresaId, "compras"] as const;

export interface FiltrosCompras {
  busqueda: string;
  desde: string;
  hasta: string;
}

/** Compras de la empresa; los filtros los resuelve la API. */
export const comprasQuery = (empresaId: string, filtros: FiltrosCompras) => {
  const q = new URLSearchParams();
  if (filtros.busqueda.trim()) q.set("busqueda", filtros.busqueda.trim());
  if (filtros.desde) q.set("desde", filtros.desde);
  if (filtros.hasta) q.set("hasta", filtros.hasta);
  const texto = q.toString();
  return queryOptions({
    queryKey: [...claveCompras(empresaId), "lista", filtros] as const,
    queryFn: ({ signal }) =>
      api<DocumentoComercialResumen[]>(`${base(empresaId)}/compras${texto ? `?${texto}` : ""}`, {
        senal: signal,
      }),
  });
};

export const compraQuery = (empresaId: string, documentoId: string) =>
  queryOptions({
    queryKey: [...claveCompras(empresaId), "detalle", documentoId] as const,
    queryFn: ({ signal }) =>
      api<DocumentoComercialVista>(`${base(empresaId)}/compras/${encodeURIComponent(documentoId)}`, {
        senal: signal,
      }),
  });

/** Registrar una compra mueve el kardex y crea una partida: se refrescan también los productos y el kardex. */
export function useRegistrarCompra(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearCompra) =>
      api<DocumentoComercialVista>(`${base(empresaId)}/compras`, { metodo: "POST", cuerpo: datos }),
    onSuccess: async () => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: claveCompras(empresaId) }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "inventario"] }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "partidas"] }),
      ]);
    },
  });
}
