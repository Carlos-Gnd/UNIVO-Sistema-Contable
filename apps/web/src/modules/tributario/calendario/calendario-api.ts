import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ultimoDiaDelMes,
  type AlertasTributarias,
  type CalendarioTributario,
  type Obligacion,
  type Vencimiento,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/calendario-tributario`;

export const clavesCalendario = {
  todo: (empresaId: string) => ["empresas", empresaId, "calendario-tributario"] as const,
};

/** Vencimientos del mes AAAA-MM. */
export const calendarioQuery = (empresaId: string, mes: string) =>
  queryOptions({
    queryKey: [...clavesCalendario.todo(empresaId), "mes", mes] as const,
    queryFn: ({ signal }) =>
      api<CalendarioTributario>(`${base(empresaId)}?desde=${mes}-01&hasta=${ultimoDiaDelMes(`${mes}-01`)}`, {
        senal: signal,
      }),
  });

/** Alerta del tablero: lo que vence en cinco días o menos y lo vencido sin presentar. */
export const alertasQuery = (empresaId: string) =>
  queryOptions({
    queryKey: [...clavesCalendario.todo(empresaId), "alertas"] as const,
    queryFn: ({ signal }) => api<AlertasTributarias>(`${base(empresaId)}/alertas`, { senal: signal }),
  });

/** Marca o quita la marca de «presentada» de un vencimiento. */
export function useMarcarPresentada(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({
      obligacion,
      periodo,
      presentada,
    }: {
      obligacion: Obligacion;
      periodo: string;
      presentada: boolean;
    }) =>
      api<Vencimiento>(`${base(empresaId)}/${obligacion}/${periodo}/presentada`, {
        metodo: presentada ? "POST" : "DELETE",
        ...(presentada ? { cuerpo: {} } : {}),
      }),
    onSettled: () => cliente.invalidateQueries({ queryKey: clavesCalendario.todo(empresaId) }),
  });
}
