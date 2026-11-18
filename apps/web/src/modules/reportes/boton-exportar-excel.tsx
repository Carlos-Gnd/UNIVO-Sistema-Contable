import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { LibroDiario } from "@contable/shared";
import { Button } from "@/components/ui/button";
import { mensajeDeError } from "@/lib/api";
import {
  crearLibroDiarioExcel,
  descargarLibroDiarioExcel,
  type DatosLibroDiarioExcel,
} from "./libro-diario-excel";

/** Genera y descarga el libro diario completo en un archivo XLSX (S2-T19). */
export function BotonExportarExcel({
  libro,
  datos,
  deshabilitado = false,
}: {
  libro: LibroDiario;
  datos: DatosLibroDiarioExcel;
  deshabilitado?: boolean;
}) {
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    setExportando(true);
    try {
      const archivo = await crearLibroDiarioExcel(libro, datos);
      descargarLibroDiarioExcel(archivo, libro.desde, libro.hasta);
      toast.success("Libro diario exportado a Excel.");
    } catch (error) {
      toast.error(`No se pudo exportar el libro diario. ${mensajeDeError(error)}`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 rounded-full px-5"
      disabled={deshabilitado || exportando || libro.paginas.length === 0}
      onClick={() => void exportar()}
    >
      {exportando ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <Download aria-hidden="true" />
      )}
      {exportando ? "Exportando…" : "Exportar a Excel"}
    </Button>
  );
}
