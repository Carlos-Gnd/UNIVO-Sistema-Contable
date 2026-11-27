/** Fecha y hora de la firma en la hora de El Salvador, como la ve el contador. */
export function formatearFirmadoEn(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return new Intl.DateTimeFormat("es-SV", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/El_Salvador",
  }).format(fecha);
}

/** Huella larga acortada para leerla de un vistazo; completa en el atributo title. */
export const huellaCorta = (huella: string) =>
  huella.length > 24 ? `${huella.slice(0, 12)}…${huella.slice(-8)}` : huella;
