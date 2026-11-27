import {
  Dinero,
  NOMBRES_ESTADOS,
  sinSigno,
  variacionPorcentual,
  type BalanceGeneral,
  type EstadoComparativo,
  type EstadoResultados,
  type FilaComparativa,
  type PeriodoComparativo,
  type SeccionEstado,
} from "@contable/shared";

/** Un renglón de un estado en un período: su cuenta de mayor, su nombre y su monto. */
interface Renglon {
  clave: string;
  codigo: string;
  nombre: string;
  monto: string;
}

/** Un bloque del estado: una sección con sus cuentas y total, o un resultado calculado entre secciones. */
type Bloque =
  | { tipo: "seccion"; id: string; titulo: string; opcional: boolean; renglones: Renglon[]; total: string }
  | { tipo: "resultado"; id: string; titulo: string; monto: string };

const seccion = (id: string, titulo: string, s: SeccionEstado, opcional = false): Bloque => ({
  tipo: "seccion",
  id,
  titulo,
  opcional,
  // El renglón calculado (sin código) es uno solo por sección: su nombre cambia entre utilidad y pérdida, la clave no
  renglones: s.renglones.map((r) => ({
    clave: r.codigo || "calculado",
    codigo: r.codigo,
    nombre: r.nombre,
    monto: r.monto,
  })),
  total: s.total,
});

const resultado = (id: string, titulo: string, monto: string): Bloque => ({
  tipo: "resultado",
  id,
  titulo,
  monto,
});

function bloquesResultados(e: EstadoResultados): Bloque[] {
  const N = NOMBRES_ESTADOS[e.formato].resultados;
  return [
    seccion("ventas", N.ventas, e.ventas),
    seccion("costoVentas", N.costoVentas, e.costoVentas),
    resultado("utilidadBruta", N.utilidadBruta, e.utilidadBruta),
    seccion("gastosOperacion", N.gastosOperacion, e.gastosOperacion),
    resultado("utilidadOperacion", N.utilidadOperacion, e.utilidadOperacion),
    seccion("otrosIngresos", N.otrosIngresos, e.otrosIngresos, true),
    seccion("otrosGastos", N.otrosGastos, e.otrosGastos, true),
    seccion("costosFinancieros", N.costosFinancieros, e.costosFinancieros, true),
    resultado("utilidadAntesImpuesto", N.utilidadAntesImpuesto, e.utilidadAntesImpuesto),
    seccion("impuestoRenta", N.impuestoRenta, e.impuestoRenta, true),
    resultado(
      "utilidadNeta",
      Dinero.de(e.utilidadNeta).esNegativo() ? N.perdidaNeta : N.utilidadNeta,
      e.utilidadNeta,
    ),
  ];
}

function bloquesBalance(b: BalanceGeneral): Bloque[] {
  const N = NOMBRES_ESTADOS[b.formato].balance;
  return [
    seccion("activoCorriente", b.activoCorriente.titulo, b.activoCorriente),
    seccion("activoNoCorriente", b.activoNoCorriente.titulo, b.activoNoCorriente),
    resultado("totalActivo", N.totalActivo, b.totalActivo),
    seccion("pasivoCorriente", b.pasivoCorriente.titulo, b.pasivoCorriente),
    seccion("pasivoNoCorriente", b.pasivoNoCorriente.titulo, b.pasivoNoCorriente),
    resultado("totalPasivo", N.totalPasivo, b.totalPasivo),
    seccion("patrimonio", b.patrimonio.titulo, b.patrimonio),
    resultado("totalPasivoPatrimonio", N.totalPasivoPatrimonio, b.totalPasivoPatrimonio),
  ];
}

/** Fila con los montos de los dos períodos y su variación exacta (A menos B) y porcentual. */
function fila(
  base: Pick<FilaComparativa, "id" | "texto" | "codigo" | "tipo">,
  a: string | undefined,
  b: string | undefined,
): FilaComparativa {
  const montoA = Dinero.de(a ?? "0");
  const montoB = Dinero.de(b ?? "0");
  return {
    ...base,
    periodoA: montoA.aTexto(),
    periodoB: montoB.aTexto(),
    variacion: montoA.menos(montoB).aTexto(),
    porcentaje: variacionPorcentual(montoA, montoB),
  };
}

/** Orden de las cuentas de una sección: por código y, al final, los renglones calculados. */
const porCodigo = (x: Renglon, y: Renglon) =>
  x.codigo === y.codigo
    ? x.clave < y.clave
      ? -1
      : 1
    : x.codigo === ""
      ? 1
      : y.codigo === ""
        ? -1
        : x.codigo < y.codigo
          ? -1
          : 1;

/**
 * Pone los dos períodos lado a lado. Los dos estados salen de la misma plantilla (mismas secciones y mismos
 * resultados), así que se recorren en paralelo; dentro de cada sección entra la unión de sus cuentas de mayor:
 * la que solo existe en un período sale con cero en el otro. Una sección opcional (otros ingresos, otros
 * gastos, impuesto) sin cuentas ni importe en ninguno de los dos períodos no se muestra.
 */
function unir(a: readonly Bloque[], b: readonly Bloque[]): FilaComparativa[] {
  const filas: FilaComparativa[] = [];
  a.forEach((bloqueA, i) => {
    const bloqueB = b[i]!;
    if (bloqueA.tipo === "resultado" && bloqueB.tipo === "resultado") {
      filas.push(
        fila(
          { id: bloqueA.id, texto: bloqueA.titulo, codigo: "", tipo: "resultado" },
          bloqueA.monto,
          bloqueB.monto,
        ),
      );
      return;
    }
    if (bloqueA.tipo !== "seccion" || bloqueB.tipo !== "seccion") return;

    const cuentas = new Map<string, { a?: Renglon; b?: Renglon }>();
    for (const r of bloqueA.renglones) cuentas.set(r.clave, { a: r });
    for (const r of bloqueB.renglones) cuentas.set(r.clave, { ...cuentas.get(r.clave), b: r });
    const vacia =
      cuentas.size === 0 && Dinero.de(bloqueA.total).esCero() && Dinero.de(bloqueB.total).esCero();
    if (bloqueA.opcional && vacia) return;

    const titulo = sinSigno(bloqueA.titulo);
    filas.push({ id: bloqueA.id, texto: bloqueA.titulo, codigo: "", tipo: "seccion" });
    const ordenadas = [...cuentas.values()].sort((x, y) => porCodigo((x.a ?? x.b)!, (y.a ?? y.b)!));
    for (const c of ordenadas) {
      const r = (c.a ?? c.b)!;
      filas.push(
        fila(
          { id: `${bloqueA.id}:${r.clave}`, texto: r.nombre, codigo: r.codigo, tipo: "renglon" },
          c.a?.monto,
          c.b?.monto,
        ),
      );
    }
    filas.push(
      fila(
        { id: `${bloqueA.id}:total`, texto: `Total ${titulo.toLowerCase()}`, codigo: "", tipo: "total" },
        bloqueA.total,
        bloqueB.total,
      ),
    );
  });
  return filas;
}

const periodo = (desde: string | null, hasta: string): PeriodoComparativo => ({ desde, hasta });

/** Compara dos estados de resultados: el período A frente al período B. */
export function compararResultados(a: EstadoResultados, b: EstadoResultados): EstadoComparativo {
  return {
    estado: "resultados",
    formato: a.formato,
    titulo: a.titulo,
    sucursalId: a.sucursalId,
    periodoA: periodo(a.desde, a.hasta),
    periodoB: periodo(b.desde, b.hasta),
    filas: unir(bloquesResultados(a), bloquesResultados(b)),
  };
}

/** Compara dos balances generales: la fecha A frente a la fecha B. */
export function compararBalances(a: BalanceGeneral, b: BalanceGeneral): EstadoComparativo {
  return {
    estado: "balance-general",
    formato: a.formato,
    titulo: a.titulo,
    sucursalId: a.sucursalId,
    periodoA: periodo(null, a.fecha),
    periodoB: periodo(null, b.fecha),
    filas: unir(bloquesBalance(a), bloquesBalance(b)),
  };
}
