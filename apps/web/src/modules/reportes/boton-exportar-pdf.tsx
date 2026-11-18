import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { LibroDiario } from "@contable/shared";
import { imprimirLibroDiario, type DatosImpresionLibroDiario } from "./libro-diario-pdf";

/** Botón para abrir el libro diario en formato de impresión y guardarlo como PDF (S2-T18). */
export function BotonExportarPdf({
  libro,
  datos,
  deshabilitado = false,
}: {
  libro: LibroDiario;
  datos: DatosImpresionLibroDiario;
  deshabilitado?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 rounded-full px-5"
      disabled={deshabilitado || libro.paginas.length === 0}
      onClick={() => {
        if (!imprimirLibroDiario(libro, datos)) {
          toast.error("Permite las ventanas emergentes para imprimir el libro diario.");
        }
      }}
    >
      <FileDown aria-hidden="true" />
      Exportar a PDF
    </Button>
  );
}
