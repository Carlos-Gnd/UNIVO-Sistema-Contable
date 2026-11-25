import { queryOptions } from "@tanstack/react-query";
import type { LibroCompras, LibroConsumidor, LibroContribuyentes } from "@contable/shared";
import { api } from "@/lib/api";
import { consultaReporte, type FiltrosReporte } from "@/modules/reportes/comun/periodo";

export type LibroIva = "compras" | "contribuyentes" | "consumidor";

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

/** Libro de ventas a contribuyentes del período, de una sucursal o consolidado (HU-46). */
export const libroContribuyentesQuery = (empresaId: string, f: FiltrosReporte) =>
  queryOptions({
    queryKey: [
      "empresas",
      empresaId,
      "libros-iva",
      "contribuyentes",
      f.desde,
      f.hasta,
      f.sucursalId,
    ] as const,
    queryFn: ({ signal }) =>
      api<LibroContribuyentes>(
        `/empresas/${encodeURIComponent(empresaId)}/libros-iva/contribuyentes${consultaReporte(f)}`,
        { senal: signal },
      ),
  });

/** Libro de ventas a consumidor final del período, de una sucursal o consolidado (HU-47). */
export const libroConsumidorQuery = (empresaId: string, f: FiltrosReporte) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "libros-iva", "consumidor", f.desde, f.hasta, f.sucursalId] as const,
    queryFn: ({ signal }) =>
      api<LibroConsumidor>(
        `/empresas/${encodeURIComponent(empresaId)}/libros-iva/consumidor-final${consultaReporte(f)}`,
        { senal: signal },
      ),
  });
