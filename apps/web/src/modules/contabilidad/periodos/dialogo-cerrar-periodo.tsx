import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Enlace } from "@/components/enlace";
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
import { formatearFecha } from "@/lib/formato";
import { mensajeDeError } from "@/lib/api";
import { borradoresDelError, useCerrarPeriodo } from "./periodos-api";
import { MESES, TEXTOS_PERIODOS } from "./textos";
import type { PeriodoDetalle } from "./tipos";

const T = TEXTOS_PERIODOS;

interface DialogoCerrarPeriodoProps {
  empresaId: string;
  /** Período que se quiere cerrar; sin él el diálogo está cerrado */
  periodo: PeriodoDetalle | undefined;
  anio: number | undefined;
  onCerrar: () => void;
}

/** Confirma el cierre de un período; si hay borradores, los lista y lleva a la bandeja de pendientes (S2-T38, HU-32). */
export function DialogoCerrarPeriodo(props: DialogoCerrarPeriodoProps) {
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
}: DialogoCerrarPeriodoProps & { periodo: PeriodoDetalle }) {
  const cerrar = useCerrarPeriodo(empresaId);
  const mes = MESES[periodo.mes - 1] ?? String(periodo.mes);
  const anioPeriodo = anio ?? Number(periodo.fechaInicio.slice(0, 4));
  const borradores = borradoresDelError(cerrar.error);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{T.cerrarPeriodo(mes, anioPeriodo)}</DialogTitle>
        <DialogDescription>{T.cierre.descripcion}</DialogDescription>
      </DialogHeader>

      {borradores.length > 0 ? (
        <div className="grid gap-3">
          <Alert variant="error">{T.cierre.impiden(borradores.length)}</Alert>
          <ul className="max-h-60 overflow-y-auto rounded-2xl bg-background text-sm">
            {borradores.map((b) => (
              <li key={b.id} className="flex gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <span className="text-muted-foreground tabular-nums">{formatearFecha(b.fecha)}</span>
                <span className="truncate">{b.concepto ?? T.cierre.sinConcepto}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : cerrar.isError ? (
        <Alert variant="error">{mensajeDeError(cerrar.error)}</Alert>
      ) : (
        <Alert>{T.cierre.bitacora}</Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={cerrar.isPending}>
          {T.cierre.cancelar}
        </Button>
        {borradores.length > 0 ? (
          <Enlace
            href={`/empresas/${encodeURIComponent(empresaId)}/pendientes`}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground"
          >
            {T.cierre.irPendientes}
          </Enlace>
        ) : (
          <Button
            type="button"
            disabled={cerrar.isPending}
            onClick={() =>
              cerrar.mutate(periodo.id, {
                onSuccess: () => {
                  toast.success(T.cierre.cerrado(mes, anioPeriodo));
                  onCerrar();
                },
              })
            }
          >
            {cerrar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {cerrar.isPending ? T.cierre.cerrando : T.cierre.confirmar}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
