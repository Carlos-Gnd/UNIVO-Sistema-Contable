import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CrearNota,
  DisponibleNota,
  NotaComercialResumen,
  NotaComercialVista,
  OperacionComercial,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
export const claveNotas = (empresaId: string) => ["empresas", empresaId, "notas-comerciales"] as const;

/** Notas de crédito y de débito de compras o ventas. */
export const notasQuery = (empresaId: string, operacion: OperacionComercial) =>
  queryOptions({
    queryKey: [...claveNotas(empresaId), "lista", operacion] as const,
    queryFn: ({ signal }) =>
      api<NotaComercialResumen[]>(`${base(empresaId)}/notas-comerciales?operacion=${operacion}`, {
        senal: signal,
      }),
  });

/** Lo que queda por devolver o rebajar de cada línea del documento. */
export const disponibleNotaQuery = (empresaId: string, operacion: OperacionComercial, documentoId: string) =>
  queryOptions({
    queryKey: [...claveNotas(empresaId), "disponible", operacion, documentoId] as const,
    queryFn: ({ signal }) =>
      api<DisponibleNota>(
        `${base(empresaId)}/notas-comerciales/disponible/${operacion}/${encodeURIComponent(documentoId)}`,
        { senal: signal },
      ),
  });

/** Una nota mueve el kardex y crea partidas: se refrescan también compras, ventas, inventario y partidas. */
export function useRegistrarNota(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearNota) =>
      api<NotaComercialVista>(`${base(empresaId)}/notas-comerciales`, { metodo: "POST", cuerpo: datos }),
    onSuccess: async () => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: claveNotas(empresaId) }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "compras"] }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "ventas"] }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "inventario"] }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "partidas"] }),
      ]);
    },
  });
}
