import {
  ArrowLeftRight,
  BookOpen,
  Building,
  Building2,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  Contact,
  DatabaseBackup,
  FileChartColumn,
  FileCheck,
  FileSpreadsheet,
  FileText,
  HandCoins,
  IdCard,
  Inbox,
  LayoutDashboard,
  ListTree,
  Lock,
  MapPin,
  Package,
  Receipt,
  Repeat,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Table2,
  TrendingDown,
  TrendingUp,
  Wallet,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { RUTAS, resolverRuta, type DefinicionRuta } from "@/app/rutas";
import { tienePermiso, type CodigoPermiso } from "@/modules/organizacion/permisos";
import type { TFunction } from "i18next";
import { i18n } from "@/i18n";
import type layoutEs from "@/i18n/locales/es/layout.json";

export type IdGrupo = keyof typeof layoutEs.grupos;
export type IdOpcion = keyof typeof layoutEs.opciones;

export interface OpcionMenu {
  id: IdOpcion;
  icono: LucideIcon;
  /** Sprint en que se entrega la pantalla */
  sprint: number;
  /** Permiso que necesita el usuario para ver la opción */
  permiso: CodigoPermiso;
  /** Ruta de la pantalla dentro de la empresa activa; sin ruta, la pantalla es de un sprint futuro */
  ruta?: (empresaId: string) => string;
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
  sprint: number;
  /** null mientras la pantalla no esté registrada: se muestra atenuada con su sprint */
  href: string | null;
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
 * Opciones del menú principal, las mismas del prototipo de interfaz. Una opción solo se puede abrir cuando su
 * pantalla ya está registrada en un *.rutas.ts; mientras tanto se muestra atenuada con el sprint en que llega.
 * Así cada historia que agrega una pantalla la habilita en el menú sin tocar este archivo.
 */
export const GRUPOS_MENU: readonly GrupoMenu[] = [
  {
    id: "general",
    opciones: [
      {
        id: "tablero",
        icono: LayoutDashboard,
        sprint: 1,
        permiso: "empresa.ver",
        ruta: enEmpresa("/tablero"),
      },
    ],
  },
  {
    id: "contabilidad",
    opciones: [
      { id: "cuentas", icono: ListTree, sprint: 1, permiso: "catalogo.ver", ruta: enEmpresa("/catalogo") },
      { id: "partidas", icono: FileText, sprint: 1, permiso: "partidas.ver", ruta: enEmpresa("/partidas") },
      {
        id: "pendientes",
        icono: Inbox,
        sprint: 1,
        permiso: "partidas.registrar",
        ruta: enEmpresa("/pendientes"),
      },
      {
        id: "periodos",
        icono: CalendarRange,
        sprint: 1,
        permiso: "empresa.ver",
        ruta: enEmpresa("/periodos"),
      },
      {
        id: "importar",
        icono: FileSpreadsheet,
        sprint: 1,
        permiso: "catalogo.importar",
        ruta: enEmpresa("/importar"),
      },
      { id: "cierre", icono: Lock, sprint: 2, permiso: "periodos.cerrar" },
      { id: "recurrentes", icono: Repeat, sprint: 4, permiso: "partidas.registrar" },
    ],
  },
  {
    id: "librosReportes",
    opciones: [
      { id: "libroDiario", icono: BookOpen, sprint: 2, permiso: "reportes.ver" },
      { id: "libroMayor", icono: BookOpen, sprint: 2, permiso: "reportes.ver" },
      { id: "balanzas", icono: Scale, sprint: 2, permiso: "reportes.ver" },
      { id: "hojaTrabajo", icono: Table2, sprint: 2, permiso: "reportes.ver" },
      { id: "estados", icono: FileChartColumn, sprint: 2, permiso: "estados.ver" },
      { id: "razones", icono: TrendingUp, sprint: 4, permiso: "analitica.ver" },
    ],
  },
  {
    id: "tributario",
    opciones: [
      { id: "librosIva", icono: BookOpen, sprint: 3, permiso: "iva.ver" },
      { id: "declaraciones", icono: FileCheck, sprint: 3, permiso: "declaraciones.ver" },
      { id: "calendario", icono: CalendarClock, sprint: 4, permiso: "declaraciones.ver" },
    ],
  },
  {
    id: "facturacion",
    opciones: [{ id: "dte", icono: Receipt, sprint: 4, permiso: "dte.ver" }],
  },
  {
    id: "comercial",
    opciones: [
      { id: "terceros", icono: Contact, sprint: 2, permiso: "terceros.ver" },
      { id: "compras", icono: ShoppingCart, sprint: 3, permiso: "operaciones.ver" },
      { id: "ventas", icono: ShoppingBag, sprint: 3, permiso: "operaciones.ver" },
      { id: "cobrosPagos", icono: HandCoins, sprint: 3, permiso: "operaciones.ver" },
    ],
  },
  {
    id: "inventario",
    opciones: [
      { id: "productos", icono: Package, sprint: 2, permiso: "inventario.ver" },
      { id: "kardex", icono: ClipboardList, sprint: 3, permiso: "inventario.ver" },
      { id: "tomaFisica", icono: ClipboardCheck, sprint: 4, permiso: "inventario.contar" },
    ],
  },
  {
    id: "planilla",
    opciones: [
      { id: "empleados", icono: IdCard, sprint: 2, permiso: "planilla.ver" },
      { id: "planillaBoletas", icono: FileText, sprint: 3, permiso: "planilla.ver" },
      { id: "prestaciones", icono: CalendarRange, sprint: 3, permiso: "planilla.ver" },
    ],
  },
  {
    id: "tesoreria",
    opciones: [
      { id: "cajaBancos", icono: Wallet, sprint: 2, permiso: "tesoreria.ver" },
      { id: "conciliacion", icono: ArrowLeftRight, sprint: 3, permiso: "tesoreria.conciliar" },
    ],
  },
  {
    id: "activoFijo",
    opciones: [
      { id: "activos", icono: Building, sprint: 2, permiso: "activo_fijo.ver" },
      { id: "depreciacion", icono: TrendingDown, sprint: 3, permiso: "activo_fijo.registrar" },
    ],
  },
  {
    id: "administracion",
    opciones: [
      {
        id: "empresa",
        icono: Building2,
        sprint: 1,
        permiso: "empresa.ver",
        ruta: enEmpresa(""),
        exacta: true,
      },
      {
        id: "sucursales",
        icono: MapPin,
        sprint: 1,
        permiso: "sucursales.ver",
        ruta: enEmpresa("/sucursales"),
      },
      {
        id: "usuarios",
        icono: ShieldCheck,
        sprint: 1,
        permiso: "usuarios.gestionar",
        ruta: enEmpresa("/usuarios"),
      },
      { id: "bitacora", icono: ScrollText, sprint: 1, permiso: "bitacora.ver", ruta: enEmpresa("/bitacora") },
      { id: "parametros", icono: Settings, sprint: 2, permiso: "empresa.configurar" },
      { id: "respaldos", icono: DatabaseBackup, sprint: 3, permiso: "respaldo.crear" },
    ],
  },
];

/** Minúsculas y sin tildes, para que «periodo» encuentre «Ejercicios y períodos». */
export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/**
 * Grupos del menú con sus opciones, con los nombres en el idioma actual. Si se pasan permisos, deja solo las
 * opciones permitidas; con búsqueda, solo las que la contienen en su nombre. Los grupos que quedan vacíos no
 * se muestran.
 */
export function gruposVisibles(
  empresaId: string,
  {
    permisos,
    busqueda = "",
    rutas = RUTAS,
    grupos = GRUPOS_MENU,
    t = i18n.getFixedT(null, "layout"),
  }: {
    permisos?: ReadonlySet<CodigoPermiso>;
    busqueda?: string;
    rutas?: readonly DefinicionRuta[];
    grupos?: readonly GrupoMenu[];
    /** Traductor del espacio "layout"; los componentes pasan el de useTranslation para seguir el idioma */
    t?: TFunction<"layout">;
  } = {},
): GrupoVisible[] {
  const buscado = normalizar(busqueda);
  return grupos
    .map((grupo) => ({
      id: grupo.id,
      titulo: t(`grupos.${grupo.id}`),
      opciones: grupo.opciones
        .filter((opcion) => !permisos || tienePermiso(permisos, opcion.permiso))
        .map((opcion): OpcionVisible => {
          const href = opcion.ruta?.(empresaId) ?? null;
          return {
            id: opcion.id,
            icono: opcion.icono,
            etiqueta: t(`opciones.${opcion.id}`),
            sprint: opcion.sprint,
            href: href && resolverRuta(href, rutas) ? href : null,
            exacta: opcion.exacta ?? false,
          };
        })
        .filter((opcion) => !buscado || normalizar(opcion.etiqueta).includes(buscado)),
    }))
    .filter((grupo) => grupo.opciones.length > 0);
}

const sinBarraFinal = (ruta: string) => (ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta);

/**
 * Opción del menú que corresponde a la ruta actual, con su grupo: la de ruta más larga que la contiene.
 * En /empresas/e1/partidas/abc gana «Partidas»; /empresas/e1 solo marca «Empresa» en su ruta exacta.
 */
export function opcionActiva(
  ruta: string,
  grupos: readonly GrupoVisible[],
): { grupo: GrupoVisible; opcion: OpcionVisible } | null {
  const actual = sinBarraFinal(ruta);
  let mejor: { grupo: GrupoVisible; opcion: OpcionVisible } | null = null;
  for (const grupo of grupos) {
    for (const opcion of grupo.opciones) {
      const { href } = opcion;
      if (!href) continue;
      const coincide = actual === href || (!opcion.exacta && actual.startsWith(`${href}/`));
      if (coincide && (!mejor || href.length > (mejor.opcion.href?.length ?? 0))) mejor = { grupo, opcion };
    }
  }
  return mejor;
}
