import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearMovimiento, KardexVista, MovimientoInventarioVista } from "@contable/shared";
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
