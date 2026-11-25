import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AbonoResumen,
  AbonoVista,
  CrearAbono,
  DocumentoPendiente,
  OperacionComercial,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
export const claveAbonos = (empresaId: string) => ["empresas", empresaId, "abonos"] as const;

/** Documentos al crédito con saldo por cobrar (venta) o por pagar (compra). */
export const pendientesQuery = (empresaId: string, operacion: OperacionComercial) =>
  queryOptions({
    queryKey: [...claveAbonos(empresaId), "pendientes", operacion] as const,
    queryFn: ({ signal }) =>
      api<DocumentoPendiente[]>(`${base(empresaId)}/abonos/pendientes?operacion=${operacion}`, {
        senal: signal,
      }),
  });

/** Cobros o pagos registrados. */
export const abonosQuery = (empresaId: string, operacion: OperacionComercial) =>
  queryOptions({
    queryKey: [...claveAbonos(empresaId), "lista", operacion] as const,
    queryFn: ({ signal }) =>
      api<AbonoResumen[]>(`${base(empresaId)}/abonos?operacion=${operacion}`, { senal: signal }),
  });

/** Un abono crea una partida y baja el saldo de los documentos: se refrescan también compras, ventas y partidas. */
export function useRegistrarAbono(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearAbono) =>
      api<AbonoVista>(`${base(empresaId)}/abonos`, { metodo: "POST", cuerpo: datos }),
    onSuccess: async () => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: claveAbonos(empresaId) }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "partidas"] }),
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "notas-comerciales"] }),
      ]);
    },
  });
}
