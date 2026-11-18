import {
  Dinero,
  type BalanceGeneral,
  type EstadoResultados,
  type RenglonEstado,
  type SeccionEstado,
} from "@contable/shared";
import type { FilaSaldos } from "./balanza.js";

export const PERMISO_VER_ESTADOS = "estados.ver";

/** Nombre de cada cuenta de mayor (código de 4 dígitos) que aparece en los estados. */
export type NombresDeMayor = ReadonlyMap<string, string>;

/** Cuenta de mayor de una cuenta: los 4 primeros dígitos de su código (1101 para 11010301). */
export const mayorDe = (codigo: string) => codigo.slice(0, 4);

/** Signo con que una cuenta suma en su sección: deudora (debe − haber) o acreedora (haber − debe). */
type Signo = "deudor" | "acreedor";

/** Arma una sección: agrupa los montos por cuenta de mayor y omite los renglones en cero. */
function seccion(
  titulo: string,
  montos: readonly { codigo: string; neto: Dinero }[],
  signo: Signo,
  nombres: NombresDeMayor,
  extra: RenglonEstado[] = [],
): SeccionEstado {
  const porMayor = new Map<string, Dinero>();
  for (const m of montos) {
    const mayor = mayorDe(m.codigo);
    const valor = signo === "deudor" ? m.neto : Dinero.cero().menos(m.neto);
    porMayor.set(mayor, (porMayor.get(mayor) ?? Dinero.cero()).mas(valor));
  }
  const renglones: RenglonEstado[] = [...porMayor]
    .filter(([, monto]) => !monto.esCero())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([codigo, monto]) => ({ codigo, nombre: nombres.get(codigo) ?? codigo, monto: monto.aTexto() }));
  renglones.push(...extra.filter((r) => !Dinero.de(r.monto).esCero()));
  return { titulo, renglones, total: Dinero.sumar(renglones.map((r) => r.monto)).aTexto() };
}

// ── Estado de resultados ────────────────────────────────────────────────────────────────────────────────

type SeccionResultados =
  "ventas" | "costoVentas" | "gastosOperacion" | "otrosIngresos" | "otrosGastos" | "impuestoRenta";

/**
 * Sección de cada cuenta de mayor de resultado, según el catálogo de la clase. Las complementarias quedan en
 * la sección a la que restan: devoluciones sobre ventas (4103) en las ventas, devoluciones sobre compras
 * (5102) en el costo y el ingreso por ISR diferido (5103) en el impuesto.
 */
const SECCION_DE_MAYOR: Record<string, SeccionResultados> = {
  "5101": "ventas",
  "4103": "ventas",
  "4101": "costoVentas",
  "4102": "costoVentas",
  "4104": "costoVentas",
  "5102": "costoVentas",
  "4201": "gastosOperacion",
  "4202": "gastosOperacion",
  "4203": "gastosOperacion",
  "4204": "impuestoRenta",
  "4205": "impuestoRenta",
  "5103": "impuestoRenta",
};

/** Sección de una cuenta de resultado; las que no están en el catálogo base van a otros ingresos o gastos. */
function seccionDeResultado(fila: FilaSaldos): SeccionResultados | null {
  if (fila.tipo === "liquidadora") return null; // Pérdidas y Ganancias solo se usa en el cierre
  const conocida = SECCION_DE_MAYOR[mayorDe(fila.codigo)];
  if (conocida) return conocida;
  return fila.tipo === "ingresos" ? "otrosIngresos" : "otrosGastos";
}

const esDeResultado = (f: FilaSaldos) =>
  f.tipo === "ingresos" || f.tipo === "costos_gastos" || f.tipo === "liquidadora";

/**
 * Arma el estado de resultados con los movimientos del período de las cuentas de resultado (los saldos
 * anteriores al período no cuentan: el estado es del período). Las filas deben venir de la balanza ajustada,
 * que excluye las partidas de cierre; si no, las cuentas de resultado quedarían en cero.
 */
export function armarEstadoResultados(
  periodo: { desde: string; hasta: string; sucursalId: string | null },
  filas: readonly FilaSaldos[],
  nombres: NombresDeMayor,
): EstadoResultados {
  const grupos: Record<SeccionResultados, { codigo: string; neto: Dinero }[]> = {
    ventas: [],
    costoVentas: [],
    gastosOperacion: [],
    otrosIngresos: [],
    otrosGastos: [],
    impuestoRenta: [],
  };
  for (const f of filas) {
    if (!esDeResultado(f)) continue;
    const destino = seccionDeResultado(f);
    if (destino) {
      grupos[destino].push({ codigo: f.codigo, neto: Dinero.de(f.movimientoDebe).menos(f.movimientoHaber) });
    }
  }

  const ventas = seccion("Ventas", grupos.ventas, "acreedor", nombres);
  const costoVentas = seccion("Costo de ventas", grupos.costoVentas, "deudor", nombres);
  const gastosOperacion = seccion("Gastos de operación", grupos.gastosOperacion, "deudor", nombres);
  const otrosIngresos = seccion("Otros ingresos", grupos.otrosIngresos, "acreedor", nombres);
  const otrosGastos = seccion("Otros gastos", grupos.otrosGastos, "deudor", nombres);
  const impuestoRenta = seccion("Impuesto sobre la renta", grupos.impuestoRenta, "deudor", nombres);

  const utilidadBruta = Dinero.de(ventas.total).menos(costoVentas.total);
  const utilidadOperacion = utilidadBruta.menos(gastosOperacion.total);
  const utilidadAntesImpuesto = utilidadOperacion.mas(otrosIngresos.total).menos(otrosGastos.total);
  const utilidadNeta = utilidadAntesImpuesto.menos(impuestoRenta.total);

  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    sucursalId: periodo.sucursalId,
    ventas,
    costoVentas,
    utilidadBruta: utilidadBruta.aTexto(),
    gastosOperacion,
    utilidadOperacion: utilidadOperacion.aTexto(),
    otrosIngresos,
    otrosGastos,
    utilidadAntesImpuesto: utilidadAntesImpuesto.aTexto(),
    impuestoRenta,
    utilidadNeta: utilidadNeta.aTexto(),
  };
}

// ── Balance general ─────────────────────────────────────────────────────────────────────────────────────

/** Saldo final neto (deudor positivo) de una cuenta: el inicial más los movimientos. */
const saldoFinal = (f: FilaSaldos) =>
  Dinero.de(f.saldoInicial).mas(f.movimientoDebe).menos(f.movimientoHaber);

/**
 * Arma el balance general con los saldos finales a la fecha. El activo y el pasivo se dividen en corriente
 * (rubros 11 y 21) y no corriente (12 y 22). Si a la fecha las cuentas de resultado todavía tienen saldo (el
 * ejercicio no se ha cerrado), su neto entra al patrimonio como utilidad o pérdida del ejercicio en curso,
 * para que el balance cuadre antes y después del cierre. Las cuentas de orden no se incluyen.
 */
export function armarBalanceGeneral(
  corte: { fecha: string; sucursalId: string | null },
  filas: readonly FilaSaldos[],
  nombres: NombresDeMayor,
): BalanceGeneral {
  const grupos = {
    activoCorriente: [] as { codigo: string; neto: Dinero }[],
    activoNoCorriente: [] as { codigo: string; neto: Dinero }[],
    pasivoCorriente: [] as { codigo: string; neto: Dinero }[],
    pasivoNoCorriente: [] as { codigo: string; neto: Dinero }[],
    patrimonio: [] as { codigo: string; neto: Dinero }[],
  };
  let resultadoEnCurso = Dinero.cero(); // neto acreedor de las cuentas de resultado: utilidad si es positivo
  for (const f of filas) {
    const neto = saldoFinal(f);
    const item = { codigo: f.codigo, neto };
    if (f.tipo === "activo") {
      (f.codigo.startsWith("11") ? grupos.activoCorriente : grupos.activoNoCorriente).push(item);
    } else if (f.tipo === "pasivo") {
      (f.codigo.startsWith("21") ? grupos.pasivoCorriente : grupos.pasivoNoCorriente).push(item);
    } else if (f.tipo === "patrimonio") {
      grupos.patrimonio.push(item);
    } else if (esDeResultado(f)) {
      resultadoEnCurso = resultadoEnCurso.menos(neto);
    }
  }

  const activoCorriente = seccion("Activo corriente", grupos.activoCorriente, "deudor", nombres);
  const activoNoCorriente = seccion("Activo no corriente", grupos.activoNoCorriente, "deudor", nombres);
  const pasivoCorriente = seccion("Pasivo corriente", grupos.pasivoCorriente, "acreedor", nombres);
  const pasivoNoCorriente = seccion("Pasivo no corriente", grupos.pasivoNoCorriente, "acreedor", nombres);
  const patrimonio = seccion("Patrimonio", grupos.patrimonio, "acreedor", nombres, [
    {
      codigo: "",
      nombre: resultadoEnCurso.esNegativo()
        ? "Pérdida del ejercicio en curso"
        : "Utilidad del ejercicio en curso",
      monto: resultadoEnCurso.aTexto(),
    },
  ]);

  const totalActivo = Dinero.de(activoCorriente.total).mas(activoNoCorriente.total);
  const totalPasivo = Dinero.de(pasivoCorriente.total).mas(pasivoNoCorriente.total);
  const totalPasivoPatrimonio = totalPasivo.mas(patrimonio.total);
  const diferencia = totalActivo.menos(totalPasivoPatrimonio);

  return {
    fecha: corte.fecha,
    sucursalId: corte.sucursalId,
    activoCorriente,
    activoNoCorriente,
    totalActivo: totalActivo.aTexto(),
    pasivoCorriente,
    pasivoNoCorriente,
    totalPasivo: totalPasivo.aTexto(),
    patrimonio,
    totalPasivoPatrimonio: totalPasivoPatrimonio.aTexto(),
    diferencia: diferencia.aTexto(),
    cuadra: diferencia.esCero(),
  };
}
