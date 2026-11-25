import { hoyIso } from "@/lib/formato";

/** Mes anterior al de hoy, el que normalmente se declara, como AAAA-MM. */
export function mesPorDefecto(): string {
  const hoy = hoyIso();
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
}
