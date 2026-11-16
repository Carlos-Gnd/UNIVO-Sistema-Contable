/** Hace que el navegador descargue un archivo generado o recibido de la API. */
export function descargarArchivo(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // Se libera después: algunos navegadores leen la URL justo tras el clic
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
