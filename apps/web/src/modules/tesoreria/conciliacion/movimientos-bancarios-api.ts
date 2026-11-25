import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CambiarEstadoCheque,
  ConciliacionBancariaVista,
  CrearConciliacionBancaria,
  CrearMovimientoBancario,
  FiltroMovimientosBancarios,
  MovimientoBancarioVista,
  ResultadoImportacionEstadoCuenta,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;
const claveMovimientos = (empresaId: string) => ["empresas", empresaId, "movimientos-bancarios"] as const;
const claveConciliaciones = (empresaId: string) =>
  ["empresas", empresaId, "conciliaciones-bancarias"] as const;

export const movimientosBancariosQuery = (
  empresaId: string,
  filtro: FiltroMovimientosBancarios,
  habilitada = true,
) =>
  queryOptions({
    queryKey: [...claveMovimientos(empresaId), filtro],
    enabled: habilitada,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams(filtro);
      return api<MovimientoBancarioVista[]>(`${base(empresaId)}/movimientos-bancarios?${params}`, {
        senal: signal,
      });
    },
  });

export function useCrearMovimientoBancario(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearMovimientoBancario) =>
      api<MovimientoBancarioVista>(`${base(empresaId)}/movimientos-bancarios`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: claveMovimientos(empresaId) });
      void cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "cuentas-tesoreria"] });
    },
  });
}

export function useCambiarEstadoCheque(empresaId: string, cuentaId: string, desde: string, hasta: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: CambiarEstadoCheque }) =>
      api<MovimientoBancarioVista>(
        `${base(empresaId)}/movimientos-bancarios/${encodeURIComponent(id)}/estado-cheque`,
        {
          metodo: "PATCH",
          cuerpo: datos,
        },
      ),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: claveMovimientos(empresaId) });
      void cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "cuentas-tesoreria"] });
      if (cuentaId && desde && hasta)
        void cliente.invalidateQueries({ queryKey: [...claveConciliaciones(empresaId)] });
    },
  });
}

export function useCrearConciliacionBancaria(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearConciliacionBancaria) =>
      api<ConciliacionBancariaVista>(`${base(empresaId)}/conciliaciones-bancarias`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: claveConciliaciones(empresaId) }),
  });
}

export const conciliacionBancariaQuery = (empresaId: string, id: string) =>
  queryOptions({
    queryKey: [...claveConciliaciones(empresaId), id],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api<ConciliacionBancariaVista>(
        `${base(empresaId)}/conciliaciones-bancarias/${encodeURIComponent(id)}`,
        { senal: signal },
      ),
  });

export function useMarcarConciliacion(empresaId: string, conciliacionId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: { partidaDetalleId: string; conciliado: boolean }) =>
      api<ConciliacionBancariaVista>(
        `${base(empresaId)}/conciliaciones-bancarias/${encodeURIComponent(conciliacionId)}/marcas`,
        {
          metodo: "PATCH",
          cuerpo: datos,
        },
      ),
    onSuccess: () =>
      void cliente.invalidateQueries({ queryKey: [...claveConciliaciones(empresaId), conciliacionId] }),
  });
}

async function enviarEstadoCuenta(
  empresaId: string,
  id: string,
  archivo: File,
  accion: "validar" | "importar",
) {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  return api<ResultadoImportacionEstadoCuenta[]>(
    `${base(empresaId)}/conciliaciones-bancarias/${encodeURIComponent(id)}/estado-cuenta/${accion}`,
    { metodo: "POST", cuerpo: formulario },
  );
}

export function useValidarEstadoCuenta(empresaId: string, id: string) {
  return useMutation({
    mutationFn: (archivo: File) => enviarEstadoCuenta(empresaId, id, archivo, "validar"),
  });
}

export function useImportarEstadoCuenta(empresaId: string, id: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (archivo: File) => enviarEstadoCuenta(empresaId, id, archivo, "importar"),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: [...claveConciliaciones(empresaId), id] }),
  });
}
