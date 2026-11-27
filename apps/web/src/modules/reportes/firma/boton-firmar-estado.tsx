import { useState } from "react";
import { LoaderCircle, PenLine, X } from "lucide-react";
import type { EstadoFirmadoVista } from "@contable/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Permiso } from "@/modules/organizacion/permisos";
import type { DocumentoEstado } from "../exportacion/documento-estado";
import { documentoAFirma } from "./documento-a-firma";
import { useFirmarEstado } from "./firma-api";
import { ResumenFirma } from "./resumen-firma";
import { TEXTOS_FIRMA } from "./textos";

const T = TEXTOS_FIRMA.dialogo;

interface BotonFirmarEstadoProps {
  empresaId: string;
  /** El mismo documento que se exporta: lo que se ve en pantalla es lo que se firma */
  documento: DocumentoEstado;
  alcance: string;
}

/**
 * Firma digital del estado que se exporta (HU-87, S4-T32). Solo lo ve quien tiene el permiso estados.firmar.
 * Envía a la API el estado tal como lo exporta la web; la API genera el PDF con firma visible y QR (PAdES) y
 * devuelve el código de verificación, desde donde se descarga el PDF firmado.
 */
export function BotonFirmarEstado(props: BotonFirmarEstadoProps) {
  return (
    <Permiso requiere="estados.firmar">
      <DialogoFirma {...props} />
    </Permiso>
  );
}

function DialogoFirma({ empresaId, documento, alcance }: BotonFirmarEstadoProps) {
  const [abierto, setAbierto] = useState(false);
  const [cargo, setCargo] = useState("");
  const [firma, setFirma] = useState<EstadoFirmadoVista | null>(null);
  const firmar = useFirmarEstado(empresaId);
  const sinFilas = documento.filas.length === 0;

  function cambiar(valor: boolean) {
    // Mientras se firma no se cierra: la firma no se puede deshacer y el usuario debe ver el resultado
    if (!valor && firmar.isPending) return;
    setAbierto(valor);
    if (!valor) {
      setFirma(null);
      setCargo("");
      firmar.reset();
    }
  }

  async function confirmar() {
    try {
      setFirma(await firmar.mutateAsync(documentoAFirma(documento, alcance, cargo)));
    } catch {
      // El error se muestra desde firmar.error
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 rounded-full px-5">
          <PenLine aria-hidden />
          {TEXTOS_FIRMA.boton}
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

        {firma ? (
          <ResumenFirma empresaId={empresaId} firma={firma} />
        ) : (
          <>
            <section aria-label={T.resumen} className="grid gap-1 rounded-2xl bg-background p-4 text-sm">
              <strong>{documento.titulo}</strong>
              <span className="text-muted-foreground">{T.periodo(documento.periodo, alcance)}</span>
            </section>
            <label className="grid gap-1.5 text-xs font-medium">
              {T.cargo}
              <Input
                value={cargo}
                maxLength={100}
                onChange={(evento) => setCargo(evento.target.value)}
                placeholder={T.cargoPorOmision}
              />
              <span className="font-normal text-muted-foreground">{T.cargoAyuda}</span>
            </label>
            <Alert>{T.aviso}</Alert>
            {sinFilas && <Alert variant="error">{T.sinFilas}</Alert>}
            {firmar.isError && (
              <Alert variant="error">
                {T.errorFirmar} {mensajeDeError(firmar.error)}
              </Alert>
            )}
          </>
        )}

        <DialogFooter className="mt-auto">
          <DialogClose asChild>
            <Button variant="ghost" disabled={firmar.isPending}>
              {firma ? T.cerrar : T.cancelar}
            </Button>
          </DialogClose>
          {!firma && (
            <Button onClick={() => void confirmar()} disabled={firmar.isPending || sinFilas}>
              {firmar.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <PenLine aria-hidden />
              )}
              {firmar.isPending ? T.firmando : T.firmar}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
