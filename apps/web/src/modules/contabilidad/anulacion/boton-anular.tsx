import { useState, type FormEvent } from "react";
import { Ban, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { anularPartidaSchema } from "@contable/shared";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { formatearFecha, hoyIso } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { Permiso } from "@/modules/organizacion/permisos";
import { useAnularPartida } from "./anulacion-api";
import { TEXTOS_ANULACION as T } from "./textos";

export interface PartidaPorAnular {
  id: string;
  numero: number;
  /** AAAA-MM-DD */
  fecha: string;
}

interface BotonAnularProps {
  empresaId: string;
  partida: PartidaPorAnular;
  onAnulada?: (reversion: { id: string; numero: number }) => void;
}

/**
 * Botón «Anular» de una partida contabilizada con su diálogo de motivo (S2-T13, HU-24). Solo lo ve quien
 * tiene partidas.anular (contador y administrador). El motivo es obligatorio; la fecha de la reversión es la de
 * hoy salvo que se elija otra, nunca anterior a la de la partida.
 */
export function BotonAnular(props: BotonAnularProps) {
  return (
    <Permiso requiere="partidas.anular">
      <BotonConPermiso {...props} />
    </Permiso>
  );
}

function BotonConPermiso({ empresaId, partida, onAnulada }: BotonAnularProps) {
  const [abierto, setAbierto] = useState(false);
  const anular = useAnularPartida(empresaId, partida.id);

  function abrir(valor: boolean) {
    if (anular.isPending) return;
    setAbierto(valor);
    if (!valor) anular.reset();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-full px-5 text-destructive"
        onClick={() => abrir(true)}
      >
        <Ban aria-hidden="true" />
        {T.anular}
      </Button>
      <Dialog open={abierto} onOpenChange={abrir}>
        <DialogContent className="sm:max-w-lg">
          {abierto && (
            <Formulario
              partida={partida}
              anular={anular}
              onCancelar={() => abrir(false)}
              onAnulada={(resultado) => {
                setAbierto(false);
                toast.success(T.exito(resultado.original.numero, resultado.reversion.numero));
                onAnulada?.(resultado.reversion);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Formulario({
  partida,
  anular,
  onCancelar,
  onAnulada,
}: {
  partida: PartidaPorAnular;
  anular: ReturnType<typeof useAnularPartida>;
  onCancelar: () => void;
  onAnulada: (resultado: { original: { numero: number }; reversion: { id: string; numero: number } }) => void;
}) {
  const hoy = hoyIso();
  const [motivo, setMotivo] = useState("");
  // Una partida con fecha futura no puede revertirse hoy: se propone su misma fecha
  const [fecha, setFecha] = useState(hoy < partida.fecha ? partida.fecha : hoy);
  const [errores, setErrores] = useState<ErroresPorCampo>({});

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (anular.isPending) return;
    anular.reset();
    const r = validarFormulario(anularPartidaSchema, { motivo, ...(fecha ? { fecha } : {}) });
    if (!r.ok) return setErrores(r.errores);
    if (r.datos.fecha && r.datos.fecha < partida.fecha) {
      return setErrores({ fecha: [T.fechaAyuda(formatearFecha(partida.fecha))] });
    }
    setErrores({});
    anular.mutate(r.datos, {
      onSuccess: onAnulada,
      onError: (error) => error instanceof ErrorApi && setErrores(error.errores),
    });
  }

  const errorApi = anular.error;
  const aviso =
    errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400) ? mensajeDeError(errorApi) : null;

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo(partida.numero)}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <Campo id="anular-motivo" etiqueta={T.motivo} ayuda={T.motivoAyuda} error={errores.motivo?.[0]}>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            maxLength={500}
            autoFocus
            placeholder={T.motivoEjemplo}
            value={motivo}
            disabled={anular.isPending}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErrores(({ motivo: _quitado, ...resto }) => resto);
            }}
          />
        )}
      </Campo>
      <Campo
        id="anular-fecha"
        etiqueta={T.fecha}
        ayuda={T.fechaAyuda(formatearFecha(partida.fecha))}
        error={errores.fecha?.[0]}
        className="sm:w-56"
      >
        {(p) => (
          <Input
            {...p}
            type="date"
            className="h-10 tabular-nums"
            min={partida.fecha}
            value={fecha}
            disabled={anular.isPending}
            onChange={(e) => {
              setFecha(e.target.value);
              setErrores(({ fecha: _quitado, ...resto }) => resto);
            }}
          />
        )}
      </Campo>

      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={anular.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" variant="destructive" disabled={anular.isPending}>
          {anular.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {anular.isPending ? T.anulando : T.confirmar}
        </Button>
      </DialogFooter>
    </form>
  );
}
