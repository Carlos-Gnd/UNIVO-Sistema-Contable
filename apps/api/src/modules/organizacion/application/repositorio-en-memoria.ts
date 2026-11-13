// Repositorio en memoria para las pruebas unitarias de los casos de uso de organización.
import type { EmpresaDetalle, SucursalDetalle } from "@contable/shared";
import type { RepositorioEmpresas, UnidadEmpresas } from "../domain/repositorio-empresas.js";

export const empresaDePrueba = (cambios: Partial<EmpresaDetalle> = {}): EmpresaDetalle => ({
  id: "empresa-1",
  nombre: "Comercial Oriente, S.A. de C.V.",
  nombreComercial: null,
  nit: "0614-010190-101-5",
  nrc: null,
  tipoContribuyente: "sociedad",
  clasificacion: "otro",
  actividadEconomica: null,
  direccion: null,
  telefono: null,
  correo: null,
  logoUrl: null,
  modoNumeracion: "anual",
  activa: true,
  creadoEn: "2026-11-13T00:00:00.000Z",
  actualizadoEn: "2026-11-13T00:00:00.000Z",
  ...cambios,
});

export const sucursalDePrueba = (cambios: Partial<SucursalDetalle> = {}): SucursalDetalle => ({
  id: "matriz",
  empresaId: "empresa-1",
  nombre: "Casa matriz",
  codigoEstablecimiento: "0001",
  codigoPuntoVenta: "0001",
  direccion: null,
  esMatriz: true,
  activa: true,
  creadoEn: "2026-11-13T00:00:00.000Z",
  actualizadoEn: "2026-11-13T00:00:00.000Z",
  ...cambios,
});

export interface OpcionesRepositorio {
  /** Permisos del usuario; null si no pertenece a la empresa */
  permisos?: string[] | null;
  contabilizadas?: boolean;
  sucursales?: SucursalDetalle[];
  /** Ids de sucursales con partidas */
  conMovimientos?: string[];
  /** Sucursales asignadas; undefined = todas */
  asignadas?: string[];
}

/** Repositorio en memoria que anota cada operación en orden. */
export function repositorioEnMemoria(opciones: OpcionesRepositorio = {}) {
  const operaciones: string[] = [];
  const sucursales = [...(opciones.sucursales ?? [sucursalDePrueba()])];
  const unidad: UnidadEmpresas = {
    asegurarUsuario: async (u) => void operaciones.push(`asegurarUsuario:${u.id}`),
    crear: async () => (operaciones.push("crear"), empresaDePrueba()),
    copiarCatalogoBase: async (e) => (operaciones.push(`catalogo:${e}`), 165),
    asignarAdministrador: async (u, e) => void operaciones.push(`administrador:${u}:${e}`),
    obtener: async () => empresaDePrueba(),
    permisos: async () =>
      opciones.permisos === null
        ? null
        : new Set(
            opciones.permisos ?? [
              "empresa.ver",
              "empresa.configurar",
              "sucursales.ver",
              "sucursales.gestionar",
            ],
          ),
    tienePartidasContabilizadas: async () => opciones.contabilizadas ?? false,
    actualizar: async (_e, cambios) => (
      operaciones.push("actualizar"),
      empresaDePrueba(cambios as Partial<EmpresaDetalle>)
    ),
    accesoSucursales: async () => ({
      todas: opciones.asignadas === undefined,
      asignadas: opciones.asignadas ?? [],
    }),
    listarSucursales: async () => sucursales,
    obtenerSucursal: async (_e, id) => sucursales.find((s) => s.id === id) ?? null,
    crearSucursal: async (empresaId, datos, esMatriz) => {
      operaciones.push(`sucursal:${datos.codigoEstablecimiento}:${esMatriz ? "matriz" : "sucursal"}`);
      const s = sucursalDePrueba({
        ...datos,
        id: `sucursal-${sucursales.length + 1}`,
        empresaId,
        esMatriz,
        direccion: datos.direccion ?? null,
      });
      sucursales.push(s);
      return s;
    },
    sucursalTieneMovimientos: async (id) => (opciones.conMovimientos ?? []).includes(id),
    actualizarSucursal: async (actual, cambios) => {
      operaciones.push(`actualizarSucursal:${actual.id}`);
      return { ...actual, ...cambios, direccion: cambios.direccion ?? actual.direccion };
    },
  };
  const repo: RepositorioEmpresas = {
    enTransaccion: async (usuarioId, fn) => {
      operaciones.push(`transaccion:${usuarioId}`);
      return fn(unidad);
    },
  };
  return { repo, operaciones, sucursales };
}
