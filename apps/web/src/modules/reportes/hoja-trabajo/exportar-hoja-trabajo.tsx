import { useState } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { HojaTrabajo } from "@contable/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mensajeDeError } from "@/lib/api";
import {
  crearHojaTrabajoExcel,
  descargarHojaTrabajoExcel,
  type DatosHojaTrabajoExportacion,
} from "./hoja-trabajo-excel";
import { imprimirHojaTrabajo } from "./hoja-trabajo-pdf";
import { TEXTOS_HOJA_TRABAJO as T } from "./textos";

/** Menú de exportación para la hoja de trabajo de diez columnas. */
export function ExportarHojaTrabajo({
  hojaTrabajo,
  datos,
  deshabilitado = false,
}: {
  hojaTrabajo?: HojaTrabajo;
  datos: DatosHojaTrabajoExportacion;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);

  function exportarPdf() {
    if (!hojaTrabajo) return;
    if (!imprimirHojaTrabajo(hojaTrabajo, datos)) toast.error(T.exportacion.errorVentanas);
    setAbierto(false);
  }

  async function exportarExcel() {
    if (!hojaTrabajo) return;
    setExportando(true);
    try {
      const archivo = await crearHojaTrabajoExcel(hojaTrabajo, datos);
      descargarHojaTrabajoExcel(archivo, hojaTrabajo);
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
          disabled={deshabilitado || !hojaTrabajo || exportando}
        >
          <Download aria-hidden="true" />
          {exportando ? T.exportacion.exportando : T.exportacion.boton}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <div aria-label={T.exportacion.opciones} className="grid gap-1">
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
