import {
  Building2,
  CalendarRange,
  FilePlus2,
  FileSpreadsheet,
  Inbox,
  ListTree,
  MapPin,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import { RUTAS, resolverRuta, type DefinicionRuta } from "@/app/rutas";
import { tienePermiso, type CodigoPermiso } from "@/modules/organizacion/permisos";
import { TEXTOS_LAYOUT } from "./textos";

export type IdGrupo = keyof typeof TEXTOS_LAYOUT.grupos;
export type IdOpcion = keyof typeof TEXTOS_LAYOUT.opciones;

export interface OpcionMenu {
  id: IdOpcion;
  icono: LucideIcon;
  /** Ruta de la pantalla dentro de la empresa activa */
  ruta: (empresaId: string) => string;
  /** Permiso que necesita el usuario para ver la opción */
  permiso: CodigoPermiso | readonly CodigoPermiso[];
  /** Solo se marca activa en su ruta exacta, no en las rutas que cuelgan de ella */
  exacta?: boolean;
}

export interface GrupoMenu {
  id: IdGrupo;
  opciones: readonly OpcionMenu[];
}

export interface OpcionVisible {
  id: IdOpcion;
  icono: LucideIcon;
  etiqueta: string;
  href: string;
  exacta: boolean;
}

export interface GrupoVisible {
  id: IdGrupo;
  titulo: string;
  opciones: OpcionVisible[];
}

const enEmpresa = (sufijo: string) => (empresaId: string) =>
  `/empresas/${encodeURIComponent(empresaId)}${sufijo}`;

/**
 * Opciones del menú lateral. Una opción solo aparece si su pantalla ya está registrada en un *.rutas.ts,
 * así cada historia que agrega una pantalla la ve en el menú sin tocar este archivo (y nunca hay enlaces rotos).
 */
export const GRUPOS_MENU: readonly GrupoMenu[] = [
  {
    id: "organizacion",
    opciones: [
      { id: "empresa", icono: Building2, ruta: enEmpresa(""), permiso: "empresa.ver", exacta: true },
      { id: "sucursales", icono: MapPin, ruta: enEmpresa("/sucursales"), permiso: "sucursales.ver" },
      { id: "usuarios", icono: Users, ruta: enEmpresa("/usuarios"), permiso: "usuarios.gestionar" },
      { id: "bitacora", icono: ScrollText, ruta: enEmpresa("/bitacora"), permiso: "bitacora.ver" },
    ],
  },
  {
    id: "contabilidad",
    opciones: [
      { id: "cuentas", icono: ListTree, ruta: enEmpresa("/cuentas"), permiso: "catalogo.ver" },
      {
        id: "importar",
        icono: FileSpreadsheet,
        ruta: enEmpresa("/cuentas/importar"),
        permiso: "catalogo.importar",
      },
      { id: "periodos", icono: CalendarRange, ruta: enEmpresa("/periodos"), permiso: "empresa.ver" },
      { id: "bandeja", icono: Inbox, ruta: enEmpresa("/partidas"), permiso: "partidas.ver" },
      {
        id: "nuevaPartida",
        icono: FilePlus2,
        ruta: enEmpresa("/partidas/nueva"),
        permiso: "partidas.registrar",
      },
    ],
  },
];

/**
 * Grupos y opciones con pantalla registrada. Si se pasan permisos, deja solo las opciones permitidas;
 * los grupos que quedan vacíos no se muestran.
 */
export function gruposVisibles(
  empresaId: string,
  {
    permisos,
    rutas = RUTAS,
    grupos = GRUPOS_MENU,
  }: {
    permisos?: ReadonlySet<CodigoPermiso>;
    rutas?: readonly DefinicionRuta[];
    grupos?: readonly GrupoMenu[];
  } = {},
): GrupoVisible[] {
  return grupos
    .map((grupo) => ({
      id: grupo.id,
      titulo: TEXTOS_LAYOUT.grupos[grupo.id],
      opciones: grupo.opciones
        .filter((opcion) => !permisos || tienePermiso(permisos, opcion.permiso))
        .map((opcion) => ({
          id: opcion.id,
          icono: opcion.icono,
          etiqueta: TEXTOS_LAYOUT.opciones[opcion.id],
          href: opcion.ruta(empresaId),
          exacta: opcion.exacta ?? false,
        }))
        .filter((opcion) => resolverRuta(opcion.href, rutas) !== null),
    }))
    .filter((grupo) => grupo.opciones.length > 0);
}

const sinBarraFinal = (ruta: string) => (ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta);

/**
 * Opción del menú que corresponde a la ruta actual: la de ruta más larga que la contiene.
 * En /empresas/e1/partidas/abc gana "Partidas pendientes" y en /empresas/e1/partidas/nueva, "Nueva partida".
 */
export function opcionActiva(ruta: string, grupos: readonly GrupoVisible[]): OpcionVisible | null {
  const actual = sinBarraFinal(ruta);
  let mejor: OpcionVisible | null = null;
  for (const opcion of grupos.flatMap((g) => g.opciones)) {
    const coincide = actual === opcion.href || (!opcion.exacta && actual.startsWith(`${opcion.href}/`));
    if (coincide && (!mejor || opcion.href.length > mejor.href.length)) mejor = opcion;
  }
  return mejor;
}
