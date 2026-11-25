import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CajaChicaVista,
  CrearCajaChica,
  CrearValeCajaChica,
  ReintegrarCajaChica,
} from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/cajas-chicas`;
const clave = (empresaId: string) => ["empresas", empresaId, "cajas-chicas"] as const;

export const cajasChicasQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<CajaChicaVista[]>(ruta(empresaId), { senal: signal }),
  });

export function useAbrirCajaChica(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearCajaChica) =>
      api<CajaChicaVista>(ruta(empresaId), { metodo: "POST", cuerpo: datos }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export function useRegistrarValeCajaChica(empresaId: string, cajaChicaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearValeCajaChica) =>
      api<CajaChicaVista>(`${ruta(empresaId)}/${encodeURIComponent(cajaChicaId)}/vales`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}

export function useReintegrarCajaChica(empresaId: string, cajaChicaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: ReintegrarCajaChica) =>
      api<CajaChicaVista>(`${ruta(empresaId)}/${encodeURIComponent(cajaChicaId)}/reintegrar`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: clave(empresaId) }),
  });
}
