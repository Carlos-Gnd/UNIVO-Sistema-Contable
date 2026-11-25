import {
  Dinero,
  type ColumnaPatrimonio,
  type EstadoCambiosPatrimonio,
  type IdColumnaPatrimonio,
  type IdRenglonPatrimonio,
  type RenglonPatrimonio,
} from "@contable/shared";
import type { FilaSaldos } from "./balanza.js";
import { mayorDe } from "./estados.js";

type TipoContribuyente = EstadoCambiosPatrimonio["tipoContribuyente"];

const TITULOS: Record<IdColumnaPatrimonio, string> = {
  capital: "Capital",
  reservas: "Reservas",
  utilidades: "Utilidades",
  retiros: "Retiros del titular",
};

const TITULOS_SOCIEDAD: Partial<Record<IdColumnaPatrimonio, string>> = {
  capital: "Capital social",
};

/** Columnas del estado según el tipo de contribuyente. */
export function columnasPatrimonio(tipo: TipoContribuyente): ColumnaPatrimonio[] {
  const ids: IdColumnaPatrimonio[] =
    tipo === "sociedad" ? ["capital", "reservas", "utilidades"] : ["capital", "utilidades", "retiros"];
  return ids.map((id) => ({
    id,
    titulo: (tipo === "sociedad" ? TITULOS_SOCIEDAD[id] : undefined) ?? TITULOS[id],
  }));
}

const CONCEPTOS: Record<IdRenglonPatrimonio, string> = {
  "saldo-inicial": "Saldo inicial",
  aportes: "Aportes y cambios en el capital",
  reservas: "Reserva legal y otras reservas",
  resultado: "Resultado del período",
  retiros: "Retiros del titular",
  otros: "Otros movimientos del patrimonio",
  "saldo-final": "Saldo final",
};

/** Columna a la que pertenece cada cuenta de mayor del patrimonio, según el catálogo base. */
function columnaDe(codigo: string, tipo: TipoContribuyente): IdColumnaPatrimonio {
  switch (mayorDe(codigo)) {
    case "3101":
    case "3102":
      return "capital";
    case "3103":
    case "3104":
      return tipo === "sociedad" ? "reservas" : "utilidades";
    case "3108":
      return tipo === "sociedad" ? "utilidades" : "retiros";
    default:
      return "utilidades";
  }
}

const esDeResultado = (f: FilaSaldos) =>
  f.tipo === "ingresos" || f.tipo === "costos_gastos" || f.tipo === "liquidadora";

/** Monto acreedor (positivo aumenta el patrimonio) de un movimiento: haber menos debe. */
const acreedor = (f: FilaSaldos) => Dinero.de(f.movimientoHaber).menos(f.movimientoDebe);

type Montos = Record<IdColumnaPatrimonio, Dinero>;
const ceros = (): Montos => ({
  capital: Dinero.cero(),
  reservas: Dinero.cero(),
  utilidades: Dinero.cero(),
  retiros: Dinero.cero(),
});

/**
 * Arma el estado de cambios en el patrimonio con los saldos de la balanza ajustada (sin las partidas de
 * cierre, que solo trasladan el resultado y los retiros al patrimonio). Las cuentas de resultado que ya
 * tenían movimiento antes del período (meses anteriores del ejercicio sin cerrar) forman parte de las
 * utilidades del saldo inicial, como en el balance general. Así el saldo final es igual al patrimonio del
 * balance a la misma fecha, esté o no cerrado el ejercicio.
 *
 * Los renglones salen de los movimientos del período: aportes (capital), traslado a reservas (de las
 * utilidades a las reservas, solo sociedades), resultado (cuentas de ingreso, costo y gasto), retiros del
 * titular (persona natural) o dividendos (el resto de los cargos a las utilidades de una sociedad) y otros.
 */
export function armarCambiosPatrimonio(
  periodo: { desde: string; hasta: string; sucursalId: string | null },
  tipo: TipoContribuyente,
  filas: readonly FilaSaldos[],
): EstadoCambiosPatrimonio {
  const inicial = ceros();
  const movimiento = ceros();
  let resultado = Dinero.cero();

  for (const f of filas) {
    if (esDeResultado(f)) {
      inicial.utilidades = inicial.utilidades.menos(f.saldoInicial);
      resultado = resultado.mas(acreedor(f));
    } else if (f.tipo === "patrimonio") {
      const col = columnaDe(f.codigo, tipo);
      inicial[col] = inicial[col].menos(f.saldoInicial);
      movimiento[col] = movimiento[col].mas(acreedor(f));
    }
  }

  const aportes = { ...ceros(), capital: movimiento.capital };
  const reservas = ceros();
  const retiros = ceros();
  const otros = ceros();
  const resultados = { ...ceros(), utilidades: resultado };

  if (tipo === "sociedad") {
    // Lo que entra a las reservas sale de las utilidades; el resto de lo que se carga a ellas son dividendos
    reservas.reservas = movimiento.reservas;
    reservas.utilidades = Dinero.cero().menos(movimiento.reservas);
    const restante = movimiento.utilidades.mas(movimiento.reservas);
    if (restante.esNegativo()) retiros.utilidades = restante;
    else otros.utilidades = restante;
  } else {
    retiros.retiros = movimiento.retiros;
    otros.utilidades = movimiento.utilidades;
  }

  const columnas = columnasPatrimonio(tipo);
  const final = ceros();
  for (const { id } of columnas) {
    final[id] = [inicial, aportes, reservas, resultados, retiros, otros]
      .map((m) => m[id])
      .reduce((a, b) => a.mas(b), Dinero.cero());
  }

  const fila = (id: IdRenglonPatrimonio, montos: Montos): RenglonPatrimonio => {
    const valores = columnas.map((c) => montos[c.id]);
    return {
      id,
      concepto: id === "retiros" && tipo === "sociedad" ? "Retiros o dividendos" : CONCEPTOS[id],
      valores: valores.map((v) => v.aTexto()),
      total: Dinero.sumar(valores).aTexto(),
    };
  };
  const todas: [IdRenglonPatrimonio, Montos][] = [
    ["saldo-inicial", inicial],
    ["aportes", aportes],
    ["reservas", reservas],
    ["resultado", resultados],
    ["retiros", retiros],
    ["otros", otros],
    ["saldo-final", final],
  ];
  // Los renglones de movimiento sin importe se omiten; el saldo inicial, el resultado y el final siempre salen
  const siempre = new Set<IdRenglonPatrimonio>(["saldo-inicial", "resultado", "saldo-final", "aportes"]);
  const renglones = todas
    .map(([id, montos]) => fila(id, montos))
    .filter((r) => siempre.has(r.id) || r.valores.some((v) => !Dinero.de(v).esCero()));

  const saldoFinal = renglones.find((r) => r.id === "saldo-final")!;
  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    sucursalId: periodo.sucursalId,
    tipoContribuyente: tipo,
    columnas,
    renglones,
    patrimonioFinal: saldoFinal.total,
  };
}
