import type { ComponentType } from "react";

export type Parametros = Readonly<Record<string, string>>;

/**
 * Pantalla de un módulo y la ruta donde se monta, por ejemplo "/empresas/:empresaId/sucursales".
 * Cada módulo las declara en un archivo *.rutas.tsx y se registran solas (ver RUTAS), así las ramas de
 * historias distintas no editan el mismo archivo.
 */
export interface DefinicionRuta {
  patron: string;
  componente: ComponentType<{ parametros: Parametros }>;
}

const segmentos = (ruta: string) => ruta.split("/").filter(Boolean);

/** Parámetros de la ruta si coincide con el patrón; null si no coincide. */
export function coincidir(patron: string, ruta: string): Parametros | null {
  const esperados = segmentos(patron);
  const actuales = segmentos(ruta);
  if (esperados.length !== actuales.length) return null;

  const parametros: Record<string, string> = {};
  for (const [i, esperado] of esperados.entries()) {
    const actual = actuales[i] ?? "";
    if (esperado.startsWith(":")) {
      try {
        parametros[esperado.slice(1)] = decodeURIComponent(actual);
      } catch {
        return null;
      }
    } else if (esperado !== actual) {
      return null;
    }
  }
  return parametros;
}

/** Primero los patrones con más segmentos fijos: /partidas/nueva gana a /partidas/:partidaId. */
const fijos = (patron: string) => segmentos(patron).filter((s) => !s.startsWith(":")).length;

export function resolverRuta(
  ruta: string,
  rutas: readonly DefinicionRuta[],
): { definicion: DefinicionRuta; parametros: Parametros } | null {
  const ordenadas = [...rutas].sort((a, b) => fijos(b.patron) - fijos(a.patron));
  for (const definicion of ordenadas) {
    const parametros = coincidir(definicion.patron, ruta);
    if (parametros) return { definicion, parametros };
  }
  return null;
}

const modulos = import.meta.glob<{ default: DefinicionRuta[] }>("../modules/**/*.rutas.tsx", { eager: true });

/** Rutas de todos los módulos. */
export const RUTAS: readonly DefinicionRuta[] = Object.values(modulos).flatMap((m) => m.default);
