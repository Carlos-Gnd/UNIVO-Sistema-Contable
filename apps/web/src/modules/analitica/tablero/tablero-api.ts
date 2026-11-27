import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Contrato publicado por el endpoint S4-T19. */
export interface TableroIndicadores {
  ventasNetas: string;
  utilidadBruta: string;
  utilidadEjercicio: string;
  efectivo: string;
  margenBruto: string;
  margenNeto: string;
  ventasSemanales: readonly {
    etiqueta: string;
    comprobantesCreditoFiscal: string;
    consumidorFinal: string;
  }[];
  etapasUtilidad: readonly {
    id: string;
    concepto: string;
    monto: string;
    porcentajeVentas: string;
  }[];
  productosRentables: readonly {
    id: string;
    nombre: string;
    utilidadBruta: string;
  }[];
  categorias: readonly {
    id: string;
    nombre: string;
    ventasNetas: string;
    utilidadBruta: string;
  }[];
}

export interface FiltrosTablero {
  mes: string;
  sucursalId: string;
}

export function tableroQuery(empresaId: string, filtros: FiltrosTablero) {
  const consulta = new URLSearchParams({ mes: filtros.mes });
  if (filtros.sucursalId) consulta.set("sucursalId", filtros.sucursalId);

  return queryOptions({
    queryKey: ["empresas", empresaId, "tablero", filtros.mes, filtros.sucursalId] as const,
    queryFn: ({ signal }) =>
      api<TableroIndicadores>(`/empresas/${encodeURIComponent(empresaId)}/tablero?${consulta.toString()}`, {
        senal: signal,
      }),
  });
}
