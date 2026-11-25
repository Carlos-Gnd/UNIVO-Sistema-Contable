import { queryOptions } from "@tanstack/react-query";
import type { LibroCompras } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte, type FiltrosReporte } from "@/modules/reportes/comun/periodo";

export type LibroIva = "compras";

/** Libro de compras del período, de una sucursal o consolidado (HU-45). */
export const libroComprasQuery = (empresaId: string, f: FiltrosReporte) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "libros-iva", "compras", f.desde, f.hasta, f.sucursalId] as const,
    queryFn: ({ signal }) =>
      api<LibroCompras>(
        `/empresas/${encodeURIComponent(empresaId)}/libros-iva/compras${consultaReporte(f)}`,
        { senal: signal },
      ),
  });
