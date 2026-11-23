import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { HojaTrabajo } from "@contable/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mensajeDeError } from "@/lib/api";
import {
  crearHojaTrabajoExcel,
  descargarHojaTrabajoExcel,
  type DatosHojaTrabajoExcel,
} from "./hoja-trabajo-excel";
import { TEXTOS_EXPORTACION_HOJA_TRABAJO as T } from "./textos";

/** Opción Excel de la exportación de la hoja de trabajo (S2-T35), lista para integrarse en la pantalla del reporte. */
export function ExportarExcelHojaTrabajo({
  reporte,
  datos,
  deshabilitado = false,
}: {
  reporte: HojaTrabajo;
  datos: DatosHojaTrabajoExcel;
  deshabilitado?: boolean;
}) {
  const [exportando, setExportando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  async function exportar() {
    setAbierto(false);
    setExportando(true);
    try {
      const archivo = await crearHojaTrabajoExcel(reporte, datos);
      descargarHojaTrabajoExcel(archivo, reporte);
      toast.success(T.exportacion.exportado);
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
          className="h-11 rounded-full px-5"
          disabled={deshabilitado || exportando}
          aria-haspopup="menu"
          aria-expanded={abierto}
        >
          {exportando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {exportando ? T.exportacion.exportando : T.exportacion.boton}
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52" role="menu" aria-label={T.exportacion.opciones}>
        <button
          type="button"
          role="menuitem"
          className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={deshabilitado || exportando}
          onClick={() => void exportar()}
        >
          {exportando ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet className="size-4" aria-hidden />
          )}
          {T.exportacion.excel}
        </button>
      </PopoverContent>
    </Popover>
  );
}
