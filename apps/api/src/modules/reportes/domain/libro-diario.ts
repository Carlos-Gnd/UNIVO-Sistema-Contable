import {
  Dinero,
  type ConsultaLibroDiario,
  type LibroDiario,
  type PaginaDiario,
  type RenglonDiario,
  type TipoPartida,
  type TotalesDiario,
} from "@contable/shared";

/** Línea de una partida con su cuenta y la cuenta de mayor a la que pertenece. */
export interface LineaDiario {
  codigo: string;
  nombre: string;
  codigoMayor: string;
  nombreMayor: string;
  debe: string;
  haber: string;
}

/** Partida contabilizada o anulada tal como entra en el libro. */
export interface PartidaDiario {
  id: string;
  /** AAAA-MM-DD */
  fecha: string;
  tipo: TipoPartida;
  numero: number | null;
  estado: "contabilizada" | "anulada";
  concepto: string | null;
  lineas: LineaDiario[];
}

/** Lo que se pide a la base: el período, el tipo y las sucursales (null = todas). */
export interface ConsultaPartidasDiario {
  empresaId: string;
  desde: string;
  hasta: string;
  tipo: TipoPartida | null;
  sucursales: readonly string[] | null;
}

const NOMBRE_TIPO: Partial<Record<TipoPartida, string>> = {
  apertura: "apertura",
  ajuste: "ajuste",
  cierre: "cierre",
  reapertura: "reapertura",
  reversion: "reversión",
};

function encabezado(p: PartidaDiario): string {
  const detalles = [NOMBRE_TIPO[p.tipo], p.estado === "anulada" ? "anulada" : undefined].filter(Boolean);
  const numero = p.numero === null ? "Partida" : `Partida N.º ${p.numero}`;
  return detalles.length > 0 ? `${numero} (${detalles.join(", ")})` : numero;
}

/**
 * Renglones de una partida en el formato de clase: el encabezado; las cuentas de mayor al debe y luego al
 * haber, cada una con el total de sus subcuentas y debajo las subcuentas con su monto en la columna Parcial
 * (una línea registrada directamente en la cuenta de mayor no lleva subcuenta); y al final el concepto.
 */
export function renglonesDePartida(p: PartidaDiario): RenglonDiario[] {
  const base = { partidaId: p.id, fecha: null, codigo: null, parcial: null, debe: null, haber: null };
  const renglones: RenglonDiario[] = [
    { ...base, tipo: "partida", fecha: p.fecha, descripcion: encabezado(p) },
  ];

  for (const lado of ["debe", "haber"] as const) {
    // Las cuentas de mayor en el orden en que aparecen en la partida
    const grupos = new Map<string, LineaDiario[]>();
    for (const l of p.lineas) {
      if (Dinero.de(l[lado]).esCero()) continue;
      grupos.set(l.codigoMayor, [...(grupos.get(l.codigoMayor) ?? []), l]);
    }
    for (const [codigoMayor, lineas] of grupos) {
      const total = Dinero.sumar(lineas.map((l) => l[lado])).aTexto();
      renglones.push({
        ...base,
        tipo: "cuenta",
        codigo: codigoMayor,
        descripcion: lineas[0]!.nombreMayor,
        [lado]: total,
      });
      for (const l of lineas) {
        if (l.codigo === codigoMayor) continue;
        renglones.push({
          ...base,
          tipo: "subcuenta",
          codigo: l.codigo,
          descripcion: l.nombre,
          parcial: Dinero.de(l[lado]).aTexto(),
        });
      }
    }
  }

  if (p.concepto) renglones.push({ ...base, tipo: "concepto", descripcion: `V/ ${p.concepto}` });
  return renglones;
}

const CERO: TotalesDiario = { debe: "0.00", haber: "0.00" };

/** Suma las columnas Debe y Haber de los renglones a unos totales (la columna Parcial no se acumula). */
function acumular(desde: TotalesDiario, renglones: readonly RenglonDiario[]): TotalesDiario {
  return {
    debe: Dinero.sumar([desde.debe, ...renglones.map((r) => r.debe ?? "0")]).aTexto(),
    haber: Dinero.sumar([desde.haber, ...renglones.map((r) => r.haber ?? "0")]).aTexto(),
  };
}

/**
 * Divide los renglones en páginas con folio correlativo desde folioInicial. Cada página empieza con lo que
 * viene de la anterior (cero en la primera) y termina con lo que pasa a la siguiente: el acumulado del Debe y
 * del Haber hasta ella. Una partida larga puede continuar en la página siguiente, como en el libro impreso.
 */
export function foliar(
  renglones: readonly RenglonDiario[],
  renglonesPorPagina: number,
  folioInicial: number,
): PaginaDiario[] {
  const paginas: PaginaDiario[] = [];
  let vienen = CERO;
  for (let i = 0; i < renglones.length; i += renglonesPorPagina) {
    const pagina = renglones.slice(i, i + renglonesPorPagina);
    const pasan = acumular(vienen, pagina);
    paginas.push({ folio: folioInicial + paginas.length, vienen, renglones: pagina, pasan });
    vienen = pasan;
  }
  return paginas;
}

/** Arma el libro diario foliado a partir de las partidas del período (en el orden en que se registraron). */
export function armarLibroDiario(
  consulta: ConsultaLibroDiario,
  partidas: readonly PartidaDiario[],
): LibroDiario {
  const renglones = partidas.flatMap(renglonesDePartida);
  const paginas = foliar(renglones, consulta.renglonesPorPagina, consulta.folioInicial);
  const totales = paginas.at(-1)?.pasan ?? CERO;
  return {
    desde: consulta.desde,
    hasta: consulta.hasta,
    sucursalId: consulta.sucursalId ?? null,
    tipo: consulta.tipo ?? null,
    renglonesPorPagina: consulta.renglonesPorPagina,
    partidas: partidas.length,
    paginas,
    totales,
    cuadra: Dinero.de(totales.debe).igualA(totales.haber),
  };
}
