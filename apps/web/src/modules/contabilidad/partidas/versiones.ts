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
export type LineaComparada = LineaPartidaVista & { marca: MarcaLinea };

const mismoMonto = (a: string, b: string) => Dinero.de(a).igualA(b);

/** Compara una versión con la anterior, línea por línea y por cuenta; las líneas quitadas se añaden al final. */
export function compararLineas(
  actuales: readonly LineaPartidaVista[],
  previas: readonly LineaPartidaVista[] | undefined,
): LineaComparada[] {
  if (!previas) return actuales.map((l) => ({ ...l, marca: "igual" }));
  const filas: LineaComparada[] = actuales.map((l) => {
    const antes = previas.find((x) => x.cuentaId === l.cuentaId);
    const marca: MarcaLinea = !antes
      ? "nueva"
      : !mismoMonto(antes.debe, l.debe) || !mismoMonto(antes.haber, l.haber)
        ? "cambio"
        : "igual";
    return { ...l, marca };
  });
  for (const x of previas) {
    if (!actuales.some((l) => l.cuentaId === x.cuentaId)) filas.push({ ...x, marca: "quitada" });
  }
  return filas;
}
