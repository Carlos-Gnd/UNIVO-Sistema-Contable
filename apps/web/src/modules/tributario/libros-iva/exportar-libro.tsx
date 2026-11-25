import { useState } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mensajeDeError } from "@/lib/api";
import { crearLibroIvaExcel, descargarLibroIvaExcel } from "./libro-excel";
import { imprimirLibroIva } from "./libro-pdf";
import type { DatosExportacionLibro, LibroTabular } from "./libro-tabular";
import { TEXTOS_LIBROS_IVA as T } from "./textos";

/** Exporta el libro de IVA que se está viendo a PDF (impresión) o Excel. */
export function ExportarLibro({
  libro,
  nombreArchivo,
  datos,
  deshabilitado = false,
}: {
  libro?: LibroTabular | undefined;
  nombreArchivo: string;
  datos: DatosExportacionLibro;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);

  function exportarPdf() {
    if (!libro) return;
    if (!imprimirLibroIva(libro, datos)) toast.error(T.exportacion.errorVentanas);
    setAbierto(false);
  }

  async function exportarExcel() {
    if (!libro) return;
    setExportando(true);
    try {
      const archivo = await crearLibroIvaExcel(libro, datos);
      descargarLibroIvaExcel(archivo, nombreArchivo, libro.desde, libro.hasta);
      toast.success(T.exportacion.exportado);
      setAbierto(false);
    } catch (error) {
      toast.error(`${T.exportacion.error} ${mensajeDeError(error)}`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-full px-5"
          disabled={deshabilitado || !libro || exportando}
        >
          <Download aria-hidden="true" />
          {exportando ? T.exportacion.exportando : T.exportacion.boton}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <div aria-label={T.exportacion.boton} className="grid gap-1">
          <Button type="button" variant="ghost" className="justify-start" onClick={exportarPdf}>
            <FileText aria-hidden="true" />
            {T.exportacion.pdf}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            disabled={exportando}
            onClick={() => void exportarExcel()}
          >
            {exportando ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <FileSpreadsheet aria-hidden="true" />
            )}
            {T.exportacion.excel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
