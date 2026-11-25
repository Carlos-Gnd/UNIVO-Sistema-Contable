import { queryOptions } from "@tanstack/react-query";
import type { AntiguedadSaldos, OperacionComercial } from "@contable/shared";
import { api } from "@/lib/api";

/** Antigüedad de saldos de clientes (venta) o proveedores (compra) al corte. */
export const antiguedadQuery = (empresaId: string, operacion: OperacionComercial, alFecha: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "abonos", "antiguedad", operacion, alFecha] as const,
    queryFn: ({ signal }) =>
      api<AntiguedadSaldos>(
        `/empresas/${encodeURIComponent(empresaId)}/antiguedad-saldos?operacion=${operacion}&alFecha=${alFecha}`,
        { senal: signal },
      ),
  });
