import { Dinero, type Monto } from "@contable/shared";

/** Monto con formato del sistema: US$ 1,234.50 y negativos entre paréntesis. */
export function formatearDinero(monto: Monto, { simbolo = true }: { simbolo?: boolean } = {}): string {
  return Dinero.de(monto).formatear({ simbolo });
}

/** Fecha AAAA-MM-DD (como la guarda la API) en el formato de la interfaz dd/mm/aaaa. */
export function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : iso;
}

/** Fecha de hoy en AAAA-MM-DD según la hora local (no UTC), para los campos de tipo date. */
export function hoyIso(ahora: Date = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}
