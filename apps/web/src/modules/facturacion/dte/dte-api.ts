import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  DteResumen,
  DteVista,
  EmitirNotaDte,
  EmitirVentaDte,
  EstadoDte,
  InvalidarDte,
  TipoDte,
} from "@contable/shared";
import { api, apiArchivo } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/dte`;
export const claveDte = (empresaId: string) => ["empresas", empresaId, "dte"] as const;

export interface FiltrosDte {
  busqueda: string;
  tipo: TipoDte | "";
  estado: EstadoDte | "";
  desde: string;
  hasta: string;
}

export const SIN_FILTROS_DTE: FiltrosDte = { busqueda: "", tipo: "", estado: "", desde: "", hasta: "" };

/** DTE emitidos por la empresa; los filtros los resuelve la API. */
export const dtesQuery = (empresaId: string, filtros: FiltrosDte) => {
  const q = new URLSearchParams();
  if (filtros.busqueda.trim()) q.set("busqueda", filtros.busqueda.trim());
  if (filtros.tipo) q.set("tipo", filtros.tipo);
  if (filtros.estado) q.set("estado", filtros.estado);
  if (filtros.desde) q.set("desde", filtros.desde);
  if (filtros.hasta) q.set("hasta", filtros.hasta);
  const texto = q.toString();
  return queryOptions({
    queryKey: [...claveDte(empresaId), "lista", filtros] as const,
    queryFn: ({ signal }) =>
      api<DteResumen[]>(`${base(empresaId)}${texto ? `?${texto}` : ""}`, { senal: signal }),
  });
};

/** El DTE con su JSON firmado, la respuesta de Hacienda y la verificación de su firma. */
export const dteQuery = (empresaId: string, dteId: string) =>
  queryOptions({
    queryKey: [...claveDte(empresaId), "detalle", dteId] as const,
    queryFn: ({ signal }) =>
      api<DteVista>(`${base(empresaId)}/${encodeURIComponent(dteId)}`, { senal: signal }),
  });

/** Representación gráfica en PDF (con el QR de la consulta pública). */
export const pdfDteQuery = (empresaId: string, dteId: string, estado: EstadoDte | undefined) =>
  queryOptions({
    // El PDF de un DTE invalidado lleva la marca de invalidado: se pide de nuevo al cambiar el estado
    queryKey: [...claveDte(empresaId), "pdf", dteId, estado] as const,
    queryFn: ({ signal }) =>
      apiArchivo(`${base(empresaId)}/${encodeURIComponent(dteId)}/pdf`, { senal: signal }),
    staleTime: Infinity,
  });

export const descargarJsonDte = (empresaId: string, dteId: string) =>
  apiArchivo(`${base(empresaId)}/${encodeURIComponent(dteId)}/json`);

/** Emitir un DTE registra una venta o una nota, mueve el kardex y crea partidas: se refresca todo eso. */
function useRefrescarTrasEmitir(empresaId: string) {
  const cliente = useQueryClient();
  return () =>
    Promise.all(
      ["dte", "ventas", "notas-comerciales", "inventario", "partidas"].map((clave) =>
        cliente.invalidateQueries({ queryKey: ["empresas", empresaId, clave] }),
      ),
    );
}

/** Factura (01) o CCF (03). */
export function useEmitirVentaDte(empresaId: string) {
  const refrescar = useRefrescarTrasEmitir(empresaId);
  return useMutation({
    mutationFn: (datos: EmitirVentaDte) =>
      api<DteVista>(`${base(empresaId)}/ventas`, { metodo: "POST", cuerpo: datos }),
    onSuccess: refrescar,
  });
}

/** Nota de crédito (05) o de débito (06) sobre un CCF electrónico. */
export function useEmitirNotaDte(empresaId: string) {
  const refrescar = useRefrescarTrasEmitir(empresaId);
  return useMutation({
    mutationFn: (datos: EmitirNotaDte) =>
      api<DteVista>(`${base(empresaId)}/notas`, { metodo: "POST", cuerpo: datos }),
    onSuccess: refrescar,
  });
}

/** Invalidar revierte las partidas y el kardex de la venta o la nota. */
export function useInvalidarDte(empresaId: string) {
  const refrescar = useRefrescarTrasEmitir(empresaId);
  return useMutation({
    mutationFn: ({
      dteId,
      ...datos
    }: Partial<InvalidarDte> & Pick<InvalidarDte, "motivo"> & { dteId: string }) =>
      api<DteVista>(`${base(empresaId)}/${encodeURIComponent(dteId)}/invalidar`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: refrescar,
  });
}
