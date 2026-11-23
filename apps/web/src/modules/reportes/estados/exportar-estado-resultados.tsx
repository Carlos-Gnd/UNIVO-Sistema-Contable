import { useState } from "react";
import { Download, FileText, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import type { EstadoResultados } from "@contable/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { mensajeDeError } from "@/lib/api";
import { formatearFecha } from "@/lib/formato";
import { TEXTOS_ESTADO_RESULTADOS as T } from "./textos";
import { crearExcelEstadoResultados, descargarExcelEstadoResultados } from "./estado-resultados-excel";
import { crearDocumentoEstadoResultados, imprimirEstadoResultados } from "./estado-resultados-pdf";

type FormatoExportacion = "pdf" | "excel";

/** Diálogo de exportación del estado de resultados con formatos y espacios opcionales para firmas. */
export function ExportarEstadoResultados({
  estado,
  empresa,
  alcance,
}: {
  estado: EstadoResultados;
  empresa: string;
  alcance: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [formato, setFormato] = useState<FormatoExportacion>("excel");
  const [incluirFirmas, setIncluirFirmas] = useState(true);
  const [propietario, setPropietario] = useState("");
  const [contador, setContador] = useState("");
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    const datos = { empresa, alcance, propietario, contador, incluirFirmas };
    if (formato === "pdf") {
      const documento = crearDocumentoEstadoResultados(estado, datos);
      if (!imprimirEstadoResultados(documento)) {
        toast.error(T.exportacion.errorVentana);
        return;
      }
      setAbierto(false);
      return;
    }

    setExportando(true);
    try {
      const archivo = await crearExcelEstadoResultados(estado, datos);
      descargarExcelEstadoResultados(archivo, estado);
      toast.success(T.exportacion.listo);
      setAbierto(false);
    } catch (error) {
      toast.error(`${T.exportacion.error} ${mensajeDeError(error)}`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="default" className="h-11 rounded-full px-5">
          <FileText aria-hidden />
          {T.exportacion.boton}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-y-0 right-0 left-auto flex h-dvh w-full max-w-md translate-x-0 translate-y-0 flex-col gap-5 overflow-y-auto rounded-l-2xl rounded-r-none p-5 sm:max-w-md"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{T.exportacion.titulo}</DialogTitle>
          <DialogDescription>{T.exportacion.descripcion}</DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Cerrar">
            <X aria-hidden />
          </Button>
        </DialogClose>

        <div
          role="tablist"
          aria-label={T.exportacion.opciones}
          className="flex rounded-full border bg-background p-1"
        >
          {(["pdf", "excel"] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={formato === valor}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm transition-colors ${formato === valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setFormato(valor)}
            >
              {valor === "pdf" ? T.exportacion.pdf : T.exportacion.excel}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={incluirFirmas}
            onChange={(evento) => setIncluirFirmas(evento.currentTarget.checked)}
          />
          {T.exportacion.incluirFirmas}
        </label>

        {incluirFirmas && (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-xs font-medium">
              {T.exportacion.propietario}
              <Input
                value={propietario}
                onChange={(evento) => setPropietario(evento.target.value)}
                placeholder={T.exportacion.nombrePropietario}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              {T.exportacion.contador}
              <Input
                value={contador}
                onChange={(evento) => setContador(evento.target.value)}
                placeholder={T.exportacion.nombreContador}
              />
            </label>
          </div>
        )}

        <section
          aria-label={T.exportacion.vistaPrevia}
          className="grid gap-5 rounded-2xl bg-background p-5 text-center"
        >
          <span className="mx-auto grid size-8 place-items-center rounded-lg bg-muted text-xs font-bold">
            CP
          </span>
          <div className="grid gap-1 text-xs">
            <strong>{empresa}</strong>
            <strong>
              {T.titulo} ·{" "}
              {T.exportacion.periodo(formatearFecha(estado.desde), formatearFecha(estado.hasta), alcance)}
            </strong>
            <span className="text-muted-foreground">{T.exportacion.dolares}</span>
          </div>
          {incluirFirmas && (
            <div className="grid grid-cols-2 gap-4 pt-4 text-xs">
              <div className="border-t pt-2">
                <strong className="block truncate">{propietario || T.exportacion.nombrePropietario}</strong>
                <span className="text-muted-foreground">{T.exportacion.representante}</span>
              </div>
              <div className="border-t pt-2">
                <strong className="block truncate">{contador || T.exportacion.nombreContador}</strong>
                <span className="text-muted-foreground">{T.exportacion.contador}</span>
              </div>
            </div>
          )}
        </section>

        <DialogFooter className="mt-auto">
          <DialogClose asChild>
            <Button variant="ghost">{T.exportacion.cancelar}</Button>
          </DialogClose>
          <Button onClick={() => void exportar()} disabled={exportando}>
            {exportando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            {exportando
              ? T.exportacion.exportando
              : formato === "pdf"
                ? T.exportacion.exportarPdf
                : T.exportacion.exportarExcel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
