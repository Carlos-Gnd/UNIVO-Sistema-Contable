import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CategoriaProducto,
  CrearCategoria,
  CrearProducto,
  EditarCategoria,
  EditarProducto,
  ProductoVista,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
const clave = (empresaId: string) => ["empresas", empresaId, "inventario"] as const;

export interface FiltrosProductos {
  busqueda: string;
  categoriaId: string;
  estado: "todos" | "activos" | "inactivos";
}

/** Productos de la empresa; los filtros los resuelve la API. */
export const productosQuery = (empresaId: string, filtros: FiltrosProductos) => {
  const q = new URLSearchParams();
  if (filtros.busqueda.trim()) q.set("busqueda", filtros.busqueda.trim());
  if (filtros.categoriaId) q.set("categoriaId", filtros.categoriaId);
  if (filtros.estado !== "todos") q.set("activo", String(filtros.estado === "activos"));
  const texto = q.toString();
  return queryOptions({
    queryKey: [...clave(empresaId), "productos", filtros] as const,
    queryFn: ({ signal }) =>
      api<ProductoVista[]>(`${base(empresaId)}/productos${texto ? `?${texto}` : ""}`, { senal: signal }),
  });
};

export const categoriasQuery = (empresaId: string) =>
  queryOptions({
    queryKey: [...clave(empresaId), "categorias"] as const,
    queryFn: ({ signal }) =>
      api<CategoriaProducto[]>(`${base(empresaId)}/categorias-producto`, { senal: signal }),
  });

/** Tras guardar, la lista y el conteo de las categorías se vuelven a pedir. */
function useRefrescar(empresaId: string) {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: clave(empresaId) });
}

export function useCrearProducto(empresaId: string) {
  const refrescar = useRefrescar(empresaId);
  return useMutation({
    mutationFn: (datos: CrearProducto) =>
      api<ProductoVista>(`${base(empresaId)}/productos`, { metodo: "POST", cuerpo: datos }),
    onSuccess: refrescar,
  });
}

export function useEditarProducto(empresaId: string) {
  const refrescar = useRefrescar(empresaId);
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: EditarProducto }) =>
      api<ProductoVista>(`${base(empresaId)}/productos/${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        cuerpo: cambios,
      }),
    onSuccess: refrescar,
  });
}

export function useCrearCategoria(empresaId: string) {
  const refrescar = useRefrescar(empresaId);
  return useMutation({
    mutationFn: (datos: CrearCategoria) =>
      api<CategoriaProducto>(`${base(empresaId)}/categorias-producto`, { metodo: "POST", cuerpo: datos }),
    onSuccess: refrescar,
  });
}

export function useEditarCategoria(empresaId: string) {
  const refrescar = useRefrescar(empresaId);
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: EditarCategoria }) =>
      api<CategoriaProducto>(`${base(empresaId)}/categorias-producto/${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        cuerpo: cambios,
      }),
    onSuccess: refrescar,
  });
}
