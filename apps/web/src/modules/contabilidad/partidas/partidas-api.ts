import { queryOptions } from "@tanstack/react-query";
import type { CrearPartidaEntrada, SucursalDetalle } from "@contable/shared";
import { api } from "@/lib/api";
import type { CuentaCatalogo, PartidaVista } from "./tipos";

const empresa = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}`;

export const clavesPartidas = {
  todas: (empresaId: string) => ["empresas", empresaId, "partidas"] as const,
  una: (empresaId: string, partidaId: string) => ["empresas", empresaId, "partidas", partidaId] as const,
};

/** Catálogo de la empresa (S1-T62). Se pide completo una vez y se filtra en el navegador al buscar. */
export const cuentasQuery = (empresaId: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "cuentas"] as const,
    queryFn: ({ signal }) => api<CuentaCatalogo[]>(`${empresa(empresaId)}/cuentas`, { senal: signal }),
    staleTime: 5 * 60_000,
  });

/** Sucursales de la empresa (S1-T43); la misma clave que usa la pantalla de sucursales. */
export const sucursalesQuery = (empresaId: string) =>
  queryOptions({
    queryKey: ["empresas", empresaId, "sucursales"] as const,
    queryFn: ({ signal }) => api<SucursalDetalle[]>(`${empresa(empresaId)}/sucursales`, { senal: signal }),
  });

export const partidaQuery = (empresaId: string, partidaId: string) =>
  queryOptions({
    queryKey: clavesPartidas.una(empresaId, partidaId),
    queryFn: ({ signal }) =>
      api<PartidaVista>(`${empresa(empresaId)}/partidas/${encodeURIComponent(partidaId)}`, { senal: signal }),
  });

/** Registra la partida como borrador, sin número (S1-T78). */
export const crearPartida = (empresaId: string, datos: CrearPartidaEntrada) =>
  api<PartidaVista>(`${empresa(empresaId)}/partidas`, { metodo: "POST", cuerpo: datos });

/** Reemplaza la cabecera y las líneas de un borrador (S1-T78). */
export const editarPartida = (empresaId: string, partidaId: string, datos: CrearPartidaEntrada) =>
  api<PartidaVista>(`${empresa(empresaId)}/partidas/${encodeURIComponent(partidaId)}`, {
    metodo: "PUT",
    cuerpo: datos,
  });
