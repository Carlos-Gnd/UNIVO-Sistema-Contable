import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ConsultaSeries,
  CrearMovimiento,
  KardexVista,
  MovimientoInventarioVista,
  SerieInventarioVista,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
const clave = (empresaId: string) => ["empresas", empresaId, "inventario"] as const;

export interface FiltrosKardex {
  sucursalId: string;
  desde: string;
  hasta: string;
}

/** Kardex del producto en una sucursal; el período es opcional. */
export const kardexQuery = (empresaId: string, productoId: string, f: FiltrosKardex) => {
  const q = new URLSearchParams({ sucursalId: f.sucursalId });
  if (f.desde) q.set("desde", f.desde);
  if (f.hasta) q.set("hasta", f.hasta);
  return queryOptions({
    queryKey: [...clave(empresaId), "kardex", productoId, f] as const,
    queryFn: ({ signal }) =>
      api<KardexVista>(
        `${base(empresaId)}/productos/${encodeURIComponent(productoId)}/kardex?${q.toString()}`,
        {
          senal: signal,
        },
      ),
  });
};

/** Series de un producto en una sucursal, con estado y costo contable por unidad. */
export const seriesQuery = (empresaId: string, productoId: string, consulta: ConsultaSeries) => {
  const q = new URLSearchParams({ sucursalId: consulta.sucursalId, estado: consulta.estado });
  return queryOptions({
    queryKey: [...clave(empresaId), "series", productoId, consulta] as const,
    queryFn: ({ signal }) =>
      api<SerieInventarioVista[]>(
        `${base(empresaId)}/productos/${encodeURIComponent(productoId)}/series?${q.toString()}`,
        { senal: signal },
      ),
  });
};

export function useRegistrarMovimiento(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearMovimiento) =>
      api<MovimientoInventarioVista>(`${base(empresaId)}/movimientos-inventario`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}
