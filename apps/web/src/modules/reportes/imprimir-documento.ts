/** Abre un documento HTML en una ventana lista para imprimirlo o guardarlo como PDF. */
export function imprimirDocumento(html: string): boolean {
  const ventana = window.open("", "_blank");
  if (!ventana) return false;

  ventana.opener = null;
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
  ventana.addEventListener(
    "load",
    () => {
      ventana.setTimeout(() => {
        ventana.focus();
        ventana.print();
      }, 200);
    },
    { once: true },
  );
  return true;
}
