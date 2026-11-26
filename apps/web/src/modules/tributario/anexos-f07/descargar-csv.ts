/** Descarga un CSV en el navegador. */
export function descargarCsv(contenido: string, nombre: string): void {
  const enlace = document.createElement("a");
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
