import { useState } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { Balanza } from "@contable/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mensajeDeError } from "@/lib/api";
import { descargarBalanzaExcel, crearBalanzaExcel, type DatosBalanzaExportacion } from "./balanza-excel";
import { imprimirBalanza } from "./balanza-pdf";
import { TEXTOS_BALANZAS as T } from "./textos";

/** Opciones para exportar el resultado actual de la consulta de balanzas. */
export function ExportarBalanza({
  balanza,
  datos,
  deshabilitado = false,
}: {
  balanza?: Balanza;
  datos: DatosBalanzaExportacion;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);

  function exportarPdf() {
    if (!balanza) return;
    if (!imprimirBalanza(balanza, datos)) toast.error(T.exportacion.errorVentanas);
    setAbierto(false);
  }

  async function exportarExcel() {
    if (!balanza) return;
    setExportando(true);
    try {
      const archivo = await crearBalanzaExcel(balanza, datos);
      descargarBalanzaExcel(archivo, balanza);
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
          disabled={deshabilitado || !balanza || exportando}
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
