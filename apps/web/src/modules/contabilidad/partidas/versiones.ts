import { Dinero, type PartidaVersionVista } from "@contable/shared";
import type { LineaPartidaVista, PartidaVista } from "./tipos";

/** Una versión de la partida lista para mostrar: la vigente y las que la base guardó al editar (HU-23). */
export interface VersionPartida {
  /** 1 a N; la vigente es la última */
  numero: number;
  vigente: boolean;
  /** ISO 8601: cuándo se creó esa versión (la partida original o la edición que la produjo) */
  fecha: string;
  partida: PartidaVista;
}

/**
 * Ordena las versiones de la más reciente a la más antigua. La API devuelve solo las reemplazadas
 * (version 1…N, de la más nueva a la más vieja); la vigente es la partida actual, la N+1.
 */
export function armarVersiones(
  actual: PartidaVista,
  anteriores: readonly PartidaVersionVista[],
): VersionPartida[] {
  const ascendentes = [...anteriores].sort((a, b) => a.version - b.version);
  const vigente = (ascendentes.at(-1)?.version ?? 0) + 1;
  const lista: VersionPartida[] = ascendentes.map((v, i) => ({
    numero: v.version,
    vigente: false,
    // La versión nace cuando se reemplazó la anterior; la primera, cuando se creó la partida
    fecha: i === 0 ? v.partida.creadoEn : (ascendentes[i - 1]?.reemplazadaEn ?? v.partida.creadoEn),
    partida: v.partida,
  }));
  lista.push({
    numero: vigente,
    vigente: true,
    fecha: ascendentes.at(-1)?.reemplazadaEn ?? actual.actualizadoEn,
    partida: actual,
  });
  return lista.reverse();
}

export type MarcaLinea = "igual" | "nueva" | "cambio" | "quitada";
export type LineaComparada = LineaPartidaVista & {
  marca: MarcaLinea;
  /** Número de aparición de la cuenta en la partida (1, 2…): una cuenta puede repetirse en varias líneas */
  aparicion: number;
};

const mismoMonto = (a: string, b: string) => Dinero.de(a).igualA(b);

/** Numera cada línea según cuántas veces ya apareció su cuenta antes (1 para la primera). */
function conAparicion(lineas: readonly LineaPartidaVista[]) {
  const vistas = new Map<string, number>();
  return lineas.map((l) => {
    const aparicion = (vistas.get(l.cuentaId) ?? 0) + 1;
    vistas.set(l.cuentaId, aparicion);
    return { ...l, aparicion };
  });
}

/**
 * Compara una versión con la anterior, línea por línea. Empareja por cuenta y por aparición, así una cuenta
 * repetida se compara con su homóloga y no siempre con la primera; las líneas quitadas se añaden al final.
 */
export function compararLineas(
  actuales: readonly LineaPartidaVista[],
  previas: readonly LineaPartidaVista[] | undefined,
): LineaComparada[] {
  const ahora = conAparicion(actuales);
  if (!previas) return ahora.map((l) => ({ ...l, marca: "igual" }));
  const antes = conAparicion(previas);
  const mismaLinea = (
    x: { cuentaId: string; aparicion: number },
    l: { cuentaId: string; aparicion: number },
  ) => x.cuentaId === l.cuentaId && x.aparicion === l.aparicion;
  const filas: LineaComparada[] = ahora.map((l) => {
    const previa = antes.find((x) => mismaLinea(x, l));
    const marca: MarcaLinea = !previa
      ? "nueva"
      : !mismoMonto(previa.debe, l.debe) || !mismoMonto(previa.haber, l.haber)
        ? "cambio"
        : "igual";
    return { ...l, marca };
  });
  for (const x of antes) {
    if (!ahora.some((l) => mismaLinea(x, l))) filas.push({ ...x, marca: "quitada" });
  }
  return filas;
}
