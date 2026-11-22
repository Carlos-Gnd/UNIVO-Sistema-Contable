import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
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
import { useReabrirPeriodo } from "./periodos-api";
import { MESES, TEXTOS_PERIODOS } from "./textos";
import type { PeriodoDetalle } from "./tipos";

const T = TEXTOS_PERIODOS;
/** Mínimo del diseño (HU-33); la API solo exige que no esté vacío y tenga hasta 500 caracteres */
const MOTIVO_MINIMO = 10;
const MOTIVO_MAXIMO = 500;

interface DialogoReabrirPeriodoProps {
  empresaId: string;
  /** Período cerrado que se quiere reabrir; sin él el diálogo está cerrado */
  periodo: PeriodoDetalle | undefined;
  anio: number | undefined;
  onCerrar: () => void;
}

/** Reapertura excepcional de un período cerrado: exige un motivo que queda en la bitácora (S2-T41, HU-33). */
export function DialogoReabrirPeriodo(props: DialogoReabrirPeriodoProps) {
  return (
    <Dialog open={props.periodo !== undefined} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-md">
        {props.periodo && <Contenido {...props} periodo={props.periodo} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({
  empresaId,
  periodo,
  anio,
  onCerrar,
}: DialogoReabrirPeriodoProps & { periodo: PeriodoDetalle }) {
  const [motivo, setMotivo] = useState("");
  const [intento, setIntento] = useState(false);
  const reabrir = useReabrirPeriodo(empresaId);
  const mes = MESES[periodo.mes - 1] ?? String(periodo.mes);
  const anioPeriodo = anio ?? Number(periodo.fechaInicio.slice(0, 4));
  const largo = motivo.trim().length;
  const errorMotivo =
    intento && largo < MOTIVO_MINIMO ? T.reapertura.faltan(MOTIVO_MINIMO - largo) : undefined;

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (reabrir.isPending) return;
    setIntento(true);
    if (largo < MOTIVO_MINIMO) return;
    reabrir.mutate(
      { periodoId: periodo.id, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast.success(T.reapertura.reabierto(mes, anioPeriodo));
          onCerrar();
        },
      },
    );
  }

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.reabrirPeriodo(mes, anioPeriodo)}</DialogTitle>
        <DialogDescription>{T.reapertura.descripcion}</DialogDescription>
      </DialogHeader>
      <Campo
        id="reapertura-motivo"
        etiqueta={T.reapertura.motivo}
        ayuda={T.reapertura.motivoAyuda(MOTIVO_MINIMO)}
        error={errorMotivo}
      >
        {(p) => (
          <Textarea
            {...p}
            autoFocus
            rows={3}
            maxLength={MOTIVO_MAXIMO}
            placeholder={T.reapertura.motivoEjemplo}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (reabrir.isError) reabrir.reset();
            }}
          />
        )}
      </Campo>
      {reabrir.isError && <Alert variant="error">{mensajeDeError(reabrir.error)}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={reabrir.isPending}>
          {T.reapertura.cancelar}
        </Button>
        <Button type="submit" variant="destructive" disabled={reabrir.isPending}>
          {reabrir.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {reabrir.isPending ? T.reapertura.reabriendo : T.reapertura.confirmar}
        </Button>
      </DialogFooter>
    </form>
  );
}
