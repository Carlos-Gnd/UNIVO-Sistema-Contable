import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Dinero, MAXIMO_LOTE_CONTABILIZACION } from "@contable/shared";
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
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { Permiso } from "@/modules/organizacion/permisos";
import { useContabilizarLote } from "./contabilizacion-api";
import { TEXTOS_CONTABILIZAR } from "./textos";

const T = TEXTOS_CONTABILIZAR.lote;

export interface PartidaSeleccionada {
  id: string;
  /** AAAA-MM-DD */
  fecha: string;
  concepto: string | null;
  totalDebe: string;
}

interface BarraContabilizarLoteProps {
  empresaId: string;
  /** Borradores cuadrados elegidos en la bandeja de pendientes */
  seleccion: readonly PartidaSeleccionada[];
  onQuitarSeleccion: () => void;
  /** Ids que recibieron número, para quitarlos de la bandeja y limpiar la selección */
  onContabilizadas?: (ids: string[]) => void;
}

/**
 * Barra flotante de la bandeja de pendientes para contabilizar por lote (S1-T86). Solo aparece con
 * partidas seleccionadas y para quien tiene partidas.contabilizar. Las partidas que la API rechace
 * (descuadradas, período cerrado…) se informan con su motivo y se quedan en la bandeja.
 */
export function BarraContabilizarLote(props: BarraContabilizarLoteProps) {
  return (
    <Permiso requiere="partidas.contabilizar">
      <BarraConPermiso {...props} />
    </Permiso>
  );
}

function BarraConPermiso({
  empresaId,
  seleccion,
  onQuitarSeleccion,
  onContabilizadas,
}: BarraContabilizarLoteProps) {
  const [confirmar, setConfirmar] = useState(false);
  const [rechazadas, setRechazadas] = useState<{ id: string; concepto: string; mensaje: string }[]>([]);
  const contabilizar = useContabilizarLote(empresaId);

  const total = Dinero.sumar(seleccion.map((p) => p.totalDebe));
  // En orden de fecha, como recibirán su número
  const ordenadas = [...seleccion].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const excede = seleccion.length > MAXIMO_LOTE_CONTABILIZACION;

  function abrir(valor: boolean) {
    if (contabilizar.isPending) return;
    setConfirmar(valor);
    if (!valor) contabilizar.reset();
  }

  function ejecutar() {
    contabilizar.mutate(
      ordenadas.map((p) => p.id),
      {
        onSuccess: (resultado) => {
          setConfirmar(false);
          if (resultado.contabilizadas.length) toast.success(T.exito(resultado.contabilizadas.length));
          // Se guarda el concepto ahora: la bandeja puede cambiar la selección después
          const conceptos = new Map(ordenadas.map((p) => [p.id, p.concepto ?? T.sinConcepto]));
          setRechazadas(
            resultado.rechazadas.map((r) => ({
              id: r.id,
              concepto: conceptos.get(r.id) ?? T.sinConcepto,
              mensaje: r.mensaje,
            })),
          );
          onContabilizadas?.(resultado.contabilizadas.map((c) => c.id));
        },
      },
    );
  }

  return (
    <>
      {seleccion.length > 0 && (
        <div
          role="region"
          aria-label={T.contabilizarN(seleccion.length)}
          className="sticky bottom-4 z-10 flex items-center gap-3 rounded-full bg-primary py-2 pr-2 pl-5 font-semibold text-primary-foreground shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
        >
          <span className="flex-1 text-sm tabular-nums">
            {T.seleccionadas(seleccion.length, formatearDinero(total))}
          </span>
          <button
            type="button"
            onClick={onQuitarSeleccion}
            className="hidden h-10 rounded-full px-4 hover:bg-black/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:block"
          >
            {T.quitarSeleccion}
          </button>
          <button
            type="button"
            disabled={excede}
            title={excede ? T.maximo(MAXIMO_LOTE_CONTABILIZACION) : undefined}
            onClick={() => abrir(true)}
            className="h-10 rounded-full bg-primary-foreground px-5 text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            {T.contabilizarN(seleccion.length)}
          </button>
        </div>
      )}
      {excede && <Alert variant="error">{T.maximo(MAXIMO_LOTE_CONTABILIZACION)}</Alert>}

      <Dialog open={confirmar} onOpenChange={abrir}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{T.titulo(seleccion.length)}</DialogTitle>
            <DialogDescription>{T.descripcion}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 overflow-y-auto rounded-2xl bg-background text-sm">
            {ordenadas.map((p) => (
              <li key={p.id} className="flex gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <span className="text-muted-foreground tabular-nums">{formatearFecha(p.fecha)}</span>
                <span className="flex-1 truncate">{p.concepto ?? T.sinConcepto}</span>
                <span className="tabular-nums">{formatearDinero(p.totalDebe, { simbolo: false })}</span>
              </li>
            ))}
          </ul>
          {contabilizar.isError && <Alert variant="error">{mensajeDeError(contabilizar.error)}</Alert>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => abrir(false)}
              disabled={contabilizar.isPending}
            >
              {TEXTOS_CONTABILIZAR.cancelar}
            </Button>
            <Button type="button" onClick={ejecutar} disabled={contabilizar.isPending}>
              {contabilizar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {contabilizar.isPending ? TEXTOS_CONTABILIZAR.contabilizando : TEXTOS_CONTABILIZAR.contabilizar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rechazadas.length > 0} onOpenChange={(abierto) => !abierto && setRechazadas([])}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{T.rechazadasTitulo(rechazadas.length)}</DialogTitle>
            <DialogDescription>{T.rechazadasDescripcion}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 overflow-y-auto rounded-2xl bg-background text-sm">
            {rechazadas.map((r) => (
              <li key={r.id} className="border-b border-border px-4 py-2.5 last:border-0">
                <span className="block font-semibold">{r.concepto}</span>
                <span className="text-destructive">{r.mensaje}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" onClick={() => setRechazadas([])}>
              {T.entendido}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
