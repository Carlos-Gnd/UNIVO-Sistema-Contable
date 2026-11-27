import {
  Dinero,
  NOMBRES_ESTADOS,
  type ActividadFlujo,
  type EstadoFlujoEfectivo,
  type FormatoEstados,
  type RenglonFlujo,
} from "@contable/shared";
import type { FilaSaldos } from "./balanza.js";
import { mayorDe } from "./estados.js";

/** Cuenta de mayor del efectivo y equivalentes: caja, caja chica y bancos. */
export const MAYOR_EFECTIVO = "1101";

type IdActividad = "operacion" | "inversion" | "financiamiento";

/**
 * Cómo se presenta el cambio de un grupo de cuentas de mayor. "activo" suma al efectivo cuando el saldo baja
 * (cobro) y resta cuando sube; "pasivo" y "patrimonio" suman cuando el saldo (acreedor) sube. Los grupos que
 * no tienen texto de aumento o disminución llevan un solo rótulo (`unico`) y el signo lo da el monto.
 */
interface Grupo {
  id: string;
  actividad: IdActividad;
  lado: "activo" | "acreedor";
  mayores: readonly string[];
  /** Nombre de lo que cambia, para «Aumento de …» o «Disminución de …» */
  nombre: string;
  /** Rótulo fijo, sin aumento ni disminución */
  unico?: string;
}

/** Grupos conocidos del catálogo base; lo que no figura aquí cae en el grupo «otros» de su rubro. */
const GRUPOS: readonly Grupo[] = [
  // Capital de trabajo (operación)
  {
    id: "cuentas-por-cobrar",
    actividad: "operacion",
    lado: "activo",
    mayores: ["1103", "1104", "1105", "1107", "1108"],
    nombre: "cuentas por cobrar",
  },
  {
    id: "inventarios",
    actividad: "operacion",
    lado: "activo",
    mayores: ["1109", "1110"],
    nombre: "inventarios",
  },
  {
    id: "gastos-anticipados",
    actividad: "operacion",
    lado: "activo",
    mayores: ["1111", "1112", "1113"],
    nombre: "gastos pagados por anticipado e impuestos a favor",
  },
  {
    id: "proveedores",
    actividad: "operacion",
    lado: "acreedor",
    mayores: ["2102", "2112"],
    nombre: "cuentas por pagar a proveedores",
  },
  {
    id: "retenciones",
    actividad: "operacion",
    lado: "acreedor",
    mayores: ["2106"],
    nombre: "retenciones por pagar",
  },
  {
    id: "empleados",
    actividad: "operacion",
    lado: "acreedor",
    mayores: ["2107", "2204"],
    nombre: "obligaciones con empleados",
  },
  {
    id: "impuestos",
    actividad: "operacion",
    lado: "acreedor",
    mayores: ["2109", "2110", "2111", "2205"],
    nombre: "impuestos por pagar",
  },
  // Inversión
  {
    id: "activo-fijo",
    actividad: "inversion",
    lado: "activo",
    mayores: ["1201", "1204", "1207"],
    nombre: "",
    unico: "Compra o venta de propiedad, planta, equipo e intangibles",
  },
  {
    id: "inversiones",
    actividad: "inversion",
    lado: "activo",
    mayores: ["1102"],
    nombre: "",
    unico: "Inversiones financieras a corto plazo",
  },
  // Financiamiento
  {
    id: "aportes",
    actividad: "financiamiento",
    lado: "acreedor",
    mayores: ["3101", "3102", "1106"],
    nombre: "",
    unico: "Aportes de capital",
  },
  {
    id: "retiros",
    actividad: "financiamiento",
    lado: "acreedor",
    mayores: ["3108"],
    nombre: "",
    unico: "Retiros del titular",
  },
  {
    id: "prestamos",
    actividad: "financiamiento",
    lado: "acreedor",
    mayores: ["2101", "2103", "2104", "2105", "2201", "2202"],
    nombre: "",
    unico: "Préstamos, documentos y sobregiros",
  },
  {
    id: "dividendos",
    actividad: "financiamiento",
    lado: "acreedor",
    mayores: ["2108"],
    nombre: "",
    unico: "Dividendos por pagar",
  },
  {
    id: "utilidades",
    actividad: "financiamiento",
    lado: "acreedor",
    mayores: ["3103", "3104", "3105", "3106", "3107"],
    nombre: "",
    unico: "Reservas, dividendos y otros movimientos de utilidades",
  },
];

/** Grupo de las cuentas que no están en el catálogo base, según su rubro. */
const GRUPO_OTROS_ACTIVO_CORRIENTE: Grupo = {
  id: "otros-activos",
  actividad: "operacion",
  lado: "activo",
  mayores: [],
  nombre: "otros activos corrientes",
};
const GRUPO_OTROS_PASIVO_CORRIENTE: Grupo = {
  id: "otros-pasivos",
  actividad: "operacion",
  lado: "acreedor",
  mayores: [],
  nombre: "otros pasivos",
};
const GRUPO_OTROS_ACTIVO_NO_CORRIENTE: Grupo = {
  id: "otros-activos-no-corrientes",
  actividad: "inversion",
  lado: "activo",
  mayores: [],
  nombre: "",
  unico: "Otros activos no corrientes",
};
const GRUPO_OTROS_PASIVO_NO_CORRIENTE: Grupo = {
  id: "otros-pasivos-no-corrientes",
  actividad: "financiamiento",
  lado: "acreedor",
  mayores: [],
  nombre: "",
  unico: "Otros pasivos no corrientes",
};

/** Cuentas de depreciación, amortización y deterioro acumulados: no mueven efectivo, se suman a la utilidad. */
const MAYORES_NO_EFECTIVO = ["1202", "1203", "1205", "1206"] as const;
const GRUPO_NO_EFECTIVO = "depreciacion";

const POR_MAYOR = new Map<string, Grupo>(GRUPOS.flatMap((g) => g.mayores.map((m) => [m, g] as const)));

const esDeResultado = (f: FilaSaldos) =>
  f.tipo === "ingresos" || f.tipo === "costos_gastos" || f.tipo === "liquidadora";

/** Grupo al que pertenece una cuenta de balance, o null si no entra al flujo (cuentas de orden). */
function grupoDe(f: FilaSaldos): Grupo | null {
  const conocido = POR_MAYOR.get(mayorDe(f.codigo));
  if (conocido) return conocido;
  if (f.tipo === "activo")
    return f.codigo.startsWith("11") ? GRUPO_OTROS_ACTIVO_CORRIENTE : GRUPO_OTROS_ACTIVO_NO_CORRIENTE;
  if (f.tipo === "pasivo")
    return f.codigo.startsWith("21") ? GRUPO_OTROS_PASIVO_CORRIENTE : GRUPO_OTROS_PASIVO_NO_CORRIENTE;
  if (f.tipo === "patrimonio") return POR_MAYOR.get("3105") ?? null;
  return null;
}

/** Cambio neto de una cuenta en el período: debe menos haber. */
const cambioDeudor = (f: FilaSaldos) => Dinero.de(f.movimientoDebe).menos(f.movimientoHaber);

/**
 * Arma el estado de flujo de efectivo por el método indirecto con los saldos de la balanza ajustada (sin las
 * partidas de cierre). La identidad contable garantiza el resultado: el cambio del efectivo es igual al cambio
 * de los pasivos y el patrimonio menos el de los demás activos. Como la utilidad neta ya está en el patrimonio,
 * se parte de ella, se deja aparte la depreciación (no mueve efectivo) y cada cuenta se clasifica en una
 * actividad. Las cuentas fuera del catálogo base se agrupan en «otros» según su rubro, así la variación
 * calculada siempre cuadra con la de las cuentas de efectivo.
 *
 * Límite: las partidas de aporte en especie (por ejemplo, mobiliario contra capital) se presentan brutas, como
 * inversión y como aporte de capital, porque el sistema no distingue la forma de pago dentro de una partida.
 */
export function armarFlujoEfectivo(
  periodo: { desde: string; hasta: string; sucursalId: string | null },
  filas: readonly FilaSaldos[],
  formato: FormatoEstados = "clase",
): EstadoFlujoEfectivo {
  const N = NOMBRES_ESTADOS[formato].flujo;

  let utilidadNeta = Dinero.cero();
  let efectivoInicial = Dinero.cero();
  let variacionLibros = Dinero.cero();
  let depreciacion = Dinero.cero(); // aumento de las cuentas acreedoras de depreciación acumulada
  // Cambio deudor (debe − haber) por grupo; el signo de su efecto en el efectivo se define al presentarlo
  const cambios = new Map<string, { grupo: Grupo; cambio: Dinero }>();

  for (const f of filas) {
    if (esDeResultado(f)) {
      utilidadNeta = utilidadNeta.mas(Dinero.de(f.movimientoHaber).menos(f.movimientoDebe));
      continue;
    }
    const mayor = mayorDe(f.codigo);
    if (f.tipo === "activo" && mayor === MAYOR_EFECTIVO) {
      efectivoInicial = efectivoInicial.mas(f.saldoInicial);
      variacionLibros = variacionLibros.mas(cambioDeudor(f));
      continue;
    }
    if ((MAYORES_NO_EFECTIVO as readonly string[]).includes(mayor)) {
      depreciacion = depreciacion.menos(cambioDeudor(f));
      continue;
    }
    const grupo = grupoDe(f);
    if (!grupo) continue;
    const previo = cambios.get(grupo.id);
    cambios.set(grupo.id, { grupo, cambio: (previo?.cambio ?? Dinero.cero()).mas(cambioDeudor(f)) });
  }

  /** Efecto en el efectivo: un activo que sube resta; un pasivo o patrimonio que sube suma. */
  const efecto = (g: Grupo, cambio: Dinero) =>
    g.lado === "activo" ? Dinero.cero().menos(cambio) : Dinero.cero().menos(cambio);

  const rotulo = (g: Grupo, monto: Dinero): string => {
    if (g.unico) return g.unico;
    const sube = g.lado === "activo" ? monto.esNegativo() : !monto.esNegativo();
    const signo = monto.esNegativo() ? "(−)" : "(+)";
    return `${signo} ${sube ? "Aumento" : "Disminución"} de ${g.nombre}`;
  };

  const renglonesDe = (actividad: IdActividad): RenglonFlujo[] =>
    [...cambios.values()]
      .filter(({ grupo }) => grupo.actividad === actividad)
      .map(({ grupo, cambio }) => ({ grupo, monto: efecto(grupo, cambio) }))
      .filter(({ monto }) => !monto.esCero())
      .sort((a, b) => ordenDe(a.grupo) - ordenDe(b.grupo))
      .map(({ grupo, monto }) => ({ id: grupo.id, concepto: rotulo(grupo, monto), monto: monto.aTexto() }));

  const actividad = (titulo: string, renglones: RenglonFlujo[]): ActividadFlujo => ({
    titulo,
    renglones,
    total: Dinero.sumar(renglones.map((r) => r.monto)).aTexto(),
  });

  const operacionBase: RenglonFlujo[] = [
    { id: "utilidad-neta", concepto: N.utilidadNeta, monto: utilidadNeta.aTexto() },
  ];
  if (!depreciacion.esCero()) {
    operacionBase.push({
      id: GRUPO_NO_EFECTIVO,
      concepto: "(+) Depreciación, amortización y deterioro del período",
      monto: depreciacion.aTexto(),
    });
  }
  const operacion = actividad(N.operacion, [...operacionBase, ...renglonesDe("operacion")]);
  const inversion = actividad(N.inversion, renglonesDe("inversion"));
  const financiamiento = actividad(N.financiamiento, renglonesDe("financiamiento"));

  const variacionNeta = Dinero.sumar([operacion.total, inversion.total, financiamiento.total]);
  return {
    formato,
    titulo: N.titulo,
    desde: periodo.desde,
    hasta: periodo.hasta,
    sucursalId: periodo.sucursalId,
    operacion,
    inversion,
    financiamiento,
    variacionNeta: variacionNeta.aTexto(),
    efectivoInicial: efectivoInicial.aTexto(),
    efectivoFinal: efectivoInicial.mas(variacionNeta).aTexto(),
    variacionLibros: variacionLibros.aTexto(),
    cuadra: variacionNeta.menos(variacionLibros).esCero(),
  };
}

/** Orden de presentación: el de la lista de grupos; los «otros» van al final de su actividad. */
function ordenDe(g: Grupo): number {
  const i = GRUPOS.findIndex((x) => x.id === g.id);
  return i === -1 ? GRUPOS.length : i;
}
