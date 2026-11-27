import { useState } from "react";
import { Download, FileText, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import type { EmpresaDetalle } from "@contable/shared";
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
import type { DocumentoEstado, EncabezadoDocumento } from "./documento-estado";
import { crearExcel, descargarExcel } from "./documento-excel";
import { crearDocumentoPdf, imprimirDocumento } from "./documento-pdf";
import { TEXTOS_EXPORTACION as T } from "./textos";

type FormatoExportacion = "pdf" | "excel";

interface ExportarEstadoProps {
  documento: DocumentoEstado;
  /** Datos de la empresa: de ella salen el nombre, el logotipo y los nombres de las firmas */
  empresa: Pick<
    EmpresaDetalle,
    | "nombre"
    | "nombreComercial"
    | "nit"
    | "logoUrl"
    | "representanteLegal"
    | "contadorNombre"
    | "contadorRegistro"
  >;
  alcance: string;
  /** Notas a los estados (HU-44): si se pasan, el diálogo ofrece incluirlas como anexo del documento */
  anexo?: DocumentoEstado | undefined;
}

/**
 * Diálogo de exportación de un estado financiero a PDF o Excel (HU-39, S3-T17): encabezado con empresa,
 * estado, período y moneda; logotipo opcional; y espacios de firma del propietario y el contador, con los
 * nombres que la empresa tiene guardados (editables para este documento).
 */
export function ExportarEstado({ documento, empresa, alcance, anexo }: ExportarEstadoProps) {
  const [abierto, setAbierto] = useState(false);
  const [formato, setFormato] = useState<FormatoExportacion>("excel");
  const [incluirLogo, setIncluirLogo] = useState(true);
  const [incluirFirmas, setIncluirFirmas] = useState(true);
  const [incluirNotas, setIncluirNotas] = useState(true);
  const [propietario, setPropietario] = useState(empresa.representanteLegal ?? "");
  const [contador, setContador] = useState(empresa.contadorNombre ?? "");
  const [registro, setRegistro] = useState(empresa.contadorRegistro ?? "");
  const [exportando, setExportando] = useState(false);

  const nombreEmpresa = empresa.nombreComercial ?? empresa.nombre;
  const logo = incluirLogo ? empresa.logoUrl : null;
  const encabezado: EncabezadoDocumento = {
    empresa: nombreEmpresa,
    nit: empresa.nit,
    alcance,
    logoUrl: logo,
  };
  const firmas = { incluir: incluirFirmas, propietario, contador, registroContador: registro };

  const notasIncluidas = anexo && incluirNotas ? anexo : undefined;

  async function exportar() {
    if (formato === "pdf") {
      if (!imprimirDocumento(crearDocumentoPdf(documento, encabezado, firmas, notasIncluidas))) {
        toast.error(T.errorVentana);
        return;
      }
      setAbierto(false);
      return;
    }
    setExportando(true);
    try {
      descargarExcel(await crearExcel(documento, encabezado, firmas, notasIncluidas), documento);
      toast.success(T.listo(documento.titulo));
      setAbierto(false);
    } catch (error) {
      toast.error(`${T.error} ${mensajeDeError(error)}`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="default" className="h-11 rounded-full px-5">
          <FileText aria-hidden />
          {T.boton}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-y-0 right-0 left-auto flex h-dvh w-full max-w-md translate-x-0 translate-y-0 flex-col gap-5 overflow-y-auto rounded-l-2xl rounded-r-none p-5 sm:max-w-md"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{T.titulo(documento.titulo)}</DialogTitle>
          <DialogDescription>{T.descripcion}</DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label={T.cerrar}>
            <X aria-hidden />
          </Button>
        </DialogClose>

        <div role="tablist" aria-label={T.opciones} className="flex rounded-full border bg-background p-1">
          {(["pdf", "excel"] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={formato === valor}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm transition-colors ${formato === valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setFormato(valor)}
            >
              {valor === "pdf" ? T.pdf : T.excel}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={incluirLogo}
            onChange={(evento) => setIncluirLogo(evento.currentTarget.checked)}
          />
          {T.incluirLogo}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={incluirFirmas}
            onChange={(evento) => setIncluirFirmas(evento.currentTarget.checked)}
          />
          {T.incluirFirmas}
        </label>

        {anexo && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={incluirNotas}
              onChange={(evento) => setIncluirNotas(evento.currentTarget.checked)}
            />
            {T.incluirNotas}
          </label>
        )}

        {incluirFirmas && (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-xs font-medium">
              {T.propietario}
              <Input
                value={propietario}
                onChange={(evento) => setPropietario(evento.target.value)}
                placeholder={T.nombrePropietario}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              {T.contador}
              <Input
                value={contador}
                onChange={(evento) => setContador(evento.target.value)}
                placeholder={T.nombreContador}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              {T.registroContador}
              <Input value={registro} onChange={(evento) => setRegistro(evento.target.value)} />
            </label>
            <p className="text-xs text-muted-foreground">{T.guardarEnEmpresa}</p>
          </div>
        )}

        <section aria-label={T.vistaPrevia} className="grid gap-5 rounded-2xl bg-background p-5 text-center">
          {logo ? (
            <img src={logo} alt="" className="mx-auto max-h-10 max-w-32 object-contain" />
          ) : (
            <span className="mx-auto grid size-8 place-items-center rounded-lg bg-muted text-xs font-bold">
              {nombreEmpresa.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="grid gap-1 text-xs">
            <strong>{nombreEmpresa}</strong>
            <strong>
              {documento.titulo} · {T.periodo(documento.periodo, alcance)}
            </strong>
            <span className="text-muted-foreground">{T.moneda}</span>
          </div>
          {incluirFirmas && (
            <div className="grid grid-cols-2 gap-4 pt-4 text-xs">
              <div className="border-t pt-2">
                <strong className="block truncate">{propietario || T.nombrePropietario}</strong>
                <span className="text-muted-foreground">{T.representante}</span>
              </div>
              <div className="border-t pt-2">
                <strong className="block truncate">{contador || T.nombreContador}</strong>
                <span className="text-muted-foreground">{T.contador}</span>
                {registro.trim() && (
                  <span className="block text-muted-foreground">{T.inscripcion(registro.trim())}</span>
                )}
              </div>
            </div>
          )}
        </section>

        <DialogFooter className="mt-auto">
          <DialogClose asChild>
            <Button variant="ghost">{T.cancelar}</Button>
          </DialogClose>
          <Button onClick={() => void exportar()} disabled={exportando}>
            {exportando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            {exportando ? T.exportando : formato === "pdf" ? T.exportarPdf : T.exportarExcel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
