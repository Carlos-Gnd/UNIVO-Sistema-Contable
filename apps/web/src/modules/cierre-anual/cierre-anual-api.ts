import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ConfiguracionIsrVista,
  CrearConfiguracionIsr,
  EstadoCierreAnual,
  PartidaAnualVista,
  ResultadoProvisionIsr,
} from "@contable/shared";
import { api } from "@/lib/api";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/cierre-anual`;
const clave = (empresaId: string, anio: number) => ["empresas", empresaId, "cierre-anual", anio] as const;

export const cierreAnualQuery = (empresaId: string, anio: number) =>
  queryOptions({
    queryKey: clave(empresaId, anio),
    queryFn: ({ signal }) => api<EstadoCierreAnual>(`${ruta(empresaId)}?anio=${anio}`, { senal: signal }),
    enabled: Boolean(empresaId),
  });

function invalidarCierre(empresaId: string, anio: number, cliente: ReturnType<typeof useQueryClient>) {
  return cliente.invalidateQueries({ queryKey: clave(empresaId, anio) });
}

export function useConfigurarIsr(empresaId: string, anio: number) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearConfiguracionIsr) =>
      api<ConfiguracionIsrVista>(`${ruta(empresaId)}/configuracion-isr`, { metodo: "POST", cuerpo: datos }),
    onSuccess: () => invalidarCierre(empresaId, anio, cliente),
  });
}

export function useCalcularIsr(empresaId: string, anio: number) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<ResultadoProvisionIsr>(`${ruta(empresaId)}/ejercicios/${anio}/impuesto-renta`, { metodo: "POST" }),
    onSuccess: () => invalidarCierre(empresaId, anio, cliente),
  });
}

export function useCerrarNoviembre(empresaId: string, anio: number) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<EstadoCierreAnual>(`${ruta(empresaId)}/ejercicios/${anio}/cerrar-noviembre`, { metodo: "POST" }),
    onSuccess: (estado) => {
      cliente.setQueryData(clave(empresaId, anio), estado);
      return invalidarCierre(empresaId, anio, cliente);
    },
  });
}

export function useCrearPartidaCierre(empresaId: string, anio: number) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<PartidaAnualVista>(`${ruta(empresaId)}/ejercicios/${anio}/partida-cierre`, { metodo: "POST" }),
    onSuccess: () => invalidarCierre(empresaId, anio, cliente),
  });
}

export function useConfirmarCierre(empresaId: string, anio: number) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<EstadoCierreAnual>(`${ruta(empresaId)}/ejercicios/${anio}/confirmar-cierre`, { metodo: "POST" }),
    onSuccess: (estado) => {
      cliente.setQueryData(clave(empresaId, anio), estado);
      return invalidarCierre(empresaId, anio, cliente);
    },
  });
}

export function useCrearPartidaReapertura(empresaId: string, anio: number) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<PartidaAnualVista>(`${ruta(empresaId)}/ejercicios/${anio}/reapertura`, { metodo: "POST" }),
    onSuccess: () => invalidarCierre(empresaId, anio, cliente),
  });
}
