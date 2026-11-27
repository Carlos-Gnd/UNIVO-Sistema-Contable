import { useState, type FormEvent } from "react";
import { Ban, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Campo } from "@/components/campo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { Permiso } from "@/modules/organizacion/permisos";
import { TEXTOS_INVALIDACION_DTE as T } from "./textos";

export interface DocumentoDteParaInvalidar {
  id: string;
  tipo: string;
  numeroControl: string;
  receptor: string;
  /** Fecha ISO AAAA-MM-DD. */
  fecha: string;
  total: string;
}

interface DialogoInvalidarDteProps {
  documento: DocumentoDteParaInvalidar;
  /** El componente padre conecta esta acción con el endpoint de invalidación del DTE. */
  onInvalidar: (datos: { documentoId: string; motivo: string }) => Promise<void>;
  onInvalidada?: () => void;
  deshabilitado?: boolean;
}

/** Diálogo de confirmación para invalidar un DTE (S4-T17, HU-57). */
export function DialogoInvalidarDte(props: DialogoInvalidarDteProps) {
  return (
    <Permiso requiere="dte.invalidar">
      <DialogoConPermiso {...props} />
    </Permiso>
  );
}

function DialogoConPermiso({
  documento,
  onInvalidar,
  onInvalidada,
  deshabilitado = false,
}: DialogoInvalidarDteProps) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string>();
  const [errorEnvio, setErrorEnvio] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  function cambiarAbierto(valor: boolean) {
    if (enviando) return;
    setAbierto(valor);
    if (!valor) limpiarFormulario();
  }

  function limpiarFormulario() {
    setMotivo("");
    setErrorMotivo(undefined);
    setErrorEnvio(undefined);
  }

  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    const motivoLimpio = motivo.trim();
    if (!motivoLimpio) {
      setErrorMotivo(T.motivoRequerido);
      return;
    }

    setErrorMotivo(undefined);
    setErrorEnvio(undefined);
    setEnviando(true);
    try {
      await onInvalidar({ documentoId: documento.id, motivo: motivoLimpio });
      setAbierto(false);
      limpiarFormulario();
      toast.success(T.exito);
      onInvalidada?.();
    } catch (error) {
      setErrorEnvio(mensajeDeError(error) || T.error);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        disabled={deshabilitado}
        onClick={() => {
          limpiarFormulario();
          setAbierto(true);
        }}
      >
        <Ban aria-hidden="true" />
        {T.abrir}
      </Button>
      <Dialog open={abierto} onOpenChange={cambiarAbierto}>
        <DialogContent className="sm:max-w-lg">
          <form noValidate onSubmit={confirmar} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{T.titulo}</DialogTitle>
              <DialogDescription>{T.descripcion}</DialogDescription>
            </DialogHeader>

            <Alert>
              <dl className="grid min-w-0 gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
                <dt className="font-medium text-foreground">{T.tipo}</dt>
                <dd className="min-w-0 break-words">{documento.tipo}</dd>
                <dt className="font-medium text-foreground">{T.numeroControl}</dt>
                <dd className="min-w-0 break-all font-mono text-xs">{documento.numeroControl}</dd>
                <dt className="font-medium text-foreground">{T.receptor}</dt>
                <dd className="min-w-0 break-words">{documento.receptor}</dd>
                <dt className="font-medium text-foreground">{T.fecha}</dt>
                <dd className="tabular-nums">{formatearFecha(documento.fecha)}</dd>
                <dt className="font-medium text-foreground">{T.total}</dt>
                <dd className="tabular-nums">{formatearDinero(documento.total, { simbolo: false })}</dd>
              </dl>
            </Alert>

            <Campo id="dte-motivo-invalidacion" etiqueta={T.motivo} ayuda={T.motivoAyuda} error={errorMotivo}>
              {(p) => (
                <Textarea
                  {...p}
                  autoFocus
                  rows={3}
                  maxLength={500}
                  placeholder={T.motivoEjemplo}
                  value={motivo}
                  disabled={enviando}
                  onChange={(evento) => {
                    setMotivo(evento.target.value);
                    setErrorMotivo(undefined);
                    setErrorEnvio(undefined);
                  }}
                />
              )}
            </Campo>

            {errorEnvio && <Alert variant="error">{errorEnvio}</Alert>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => cambiarAbierto(false)}
                disabled={enviando}
              >
                {T.cancelar}
              </Button>
              <Button type="submit" variant="destructive" disabled={enviando || deshabilitado}>
                {enviando && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                {enviando ? T.invalidando : T.confirmar}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
