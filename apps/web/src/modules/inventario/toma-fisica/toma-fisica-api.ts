import { queryOptions } from "@tanstack/react-query";
import type {
  AprobarTomaFisica,
  ConsultaInventarioAnalitico,
  CrearTomaFisica,
  GuardarConteoTomaFisica,
  InventarioAnaliticoVista,
  ProductoReabastecimientoVista,
  TomaFisicaVista,
} from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;

/** Productos que llegaron o bajaron de su punto de reorden por sucursal (HU-67). */
export const reabastecimientoQuery = (empresaId: string, sucursalId: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "inventario", "reabastecimiento", sucursalId] as const,
    queryFn: ({ signal }) =>
      api<ProductoReabastecimientoVista[]>(
        `${base(empresaId)}/productos/reabastecimiento?sucursalId=${encodeURIComponent(sucursalId)}`,
        { senal: signal },
      ),
  });

export const claveTomaFisica = (empresaId: string, sucursalId: string) =>
  ["empresas", empresaId, "inventario", "toma-fisica", sucursalId] as const;

export const tomaFisicaQuery = (empresaId: string, sucursalId: string) =>
  queryOptions({
    queryKey: claveTomaFisica(empresaId, sucursalId),
    queryFn: ({ signal }) =>
      api<TomaFisicaVista | null>(
        `${base(empresaId)}/tomas-fisicas?sucursalId=${encodeURIComponent(sucursalId)}`,
        { senal: signal },
      ),
  });

/** Costo de ventas periódico desde las cuentas contabilizadas y la toma física final (HU-69). */
export const inventarioAnaliticoQuery = (empresaId: string, consulta: ConsultaInventarioAnalitico) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "inventario", "analitico", consulta] as const,
    queryFn: ({ signal }) => {
      const parametros = new URLSearchParams({
        desde: consulta.desde,
        hasta: consulta.hasta,
        ...(consulta.sucursalId ? { sucursalId: consulta.sucursalId } : {}),
      });
      return api<InventarioAnaliticoVista>(
        base(empresaId) + "/inventario-analitico?" + parametros.toString(),
        { senal: signal },
      );
    },
  });

export const iniciarTomaFisica = (empresaId: string, datos: CrearTomaFisica) =>
  api<TomaFisicaVista>(`${base(empresaId)}/tomas-fisicas`, { metodo: "POST", cuerpo: datos });

export const guardarConteoTomaFisica = (empresaId: string, tomaId: string, datos: GuardarConteoTomaFisica) =>
  api<TomaFisicaVista>(`${base(empresaId)}/tomas-fisicas/${encodeURIComponent(tomaId)}/conteo`, {
    metodo: "PATCH",
    cuerpo: datos,
  });

export const aprobarTomaFisica = (empresaId: string, tomaId: string, datos: AprobarTomaFisica) =>
  api<TomaFisicaVista>(`${base(empresaId)}/tomas-fisicas/${encodeURIComponent(tomaId)}/aprobar`, {
    metodo: "POST",
    cuerpo: datos,
  });
