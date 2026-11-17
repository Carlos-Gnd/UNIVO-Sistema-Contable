import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { TipoPartida } from "@contable/shared";
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
import { ETIQUETA_TIPO_PARTIDA } from "../partidas/tipos";
import { useContabilizarPartida } from "./contabilizacion-api";
import { TEXTOS_CONTABILIZAR } from "./textos";

const T = TEXTOS_CONTABILIZAR;

export interface PartidaPorContabilizar {
  id: string;
  /** AAAA-MM-DD */
  fecha: string;
  tipo: TipoPartida;
  totalDebe: string;
}

interface BotonContabilizarProps {
  empresaId: string;
  /** Borrador guardado; sin él (partida nueva) el botón se muestra deshabilitado */
  partida?: PartidaPorContabilizar;
  /** Debe = haber, mayor que cero y sin errores de captura */
  cuadra: boolean;
  /** Hay cambios sin guardar: se contabiliza lo guardado, así que primero hay que guardar */
  cambiosPendientes: boolean;
  onContabilizada?: (numero: number) => void;
}

/**
 * Botón «Contabilizar» del formulario de partida (S1-T86). Solo lo ve quien tiene partidas.contabilizar
 * (el auxiliar no); pide confirmación porque una partida contabilizada ya no se puede eliminar.
 */
export function BotonContabilizar(props: BotonContabilizarProps) {
  return (
    <Permiso requiere="partidas.contabilizar">
      <BotonContabilizarConPermiso {...props} />
    </Permiso>
  );
}

function BotonContabilizarConPermiso({
  empresaId,
  partida,
  cuadra,
  cambiosPendientes,
  onContabilizada,
}: BotonContabilizarProps) {
  const [confirmar, setConfirmar] = useState(false);
  const contabilizar = useContabilizarPartida(empresaId);
  const motivo =
    !partida || cambiosPendientes ? T.individual.guardarAntes : !cuadra ? T.individual.noCuadra : null;

  function abrir(valor: boolean) {
    if (contabilizar.isPending) return;
    setConfirmar(valor);
    if (!valor) contabilizar.reset();
  }

  return (
    <>
      <Button
        type="button"
        className="col-span-2 order-first h-11 rounded-full px-5 sm:order-none"
        disabled={motivo !== null}
        title={motivo ?? undefined}
        aria-describedby={motivo ? "contabilizar-motivo" : undefined}
        onClick={() => abrir(true)}
      >
        {T.contabilizar}
      </Button>
      {motivo && (
        <span id="contabilizar-motivo" className="sr-only">
          {motivo}
        </span>
      )}

      {partida && (
        <Dialog open={confirmar} onOpenChange={abrir}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{T.individual.titulo}</DialogTitle>
              <DialogDescription>{T.individual.descripcion}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-background p-3">
                <span className="block text-xs text-muted-foreground">{T.individual.fechaTipo}</span>
                {formatearFecha(partida.fecha)} · {ETIQUETA_TIPO_PARTIDA[partida.tipo]}
              </div>
              <div className="rounded-xl bg-background p-3">
                <span className="block text-xs text-muted-foreground">{T.individual.total}</span>
                <span className="font-semibold tabular-nums">{formatearDinero(partida.totalDebe)}</span>
              </div>
            </div>
            {contabilizar.isError && <Alert variant="error">{mensajeDeError(contabilizar.error)}</Alert>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => abrir(false)}
                disabled={contabilizar.isPending}
              >
                {T.cancelar}
              </Button>
              <Button
                type="button"
                disabled={contabilizar.isPending}
                onClick={() =>
                  contabilizar.mutate(partida.id, {
                    onSuccess: ({ numero }) => {
                      setConfirmar(false);
                      toast.success(T.individual.exito(numero));
                      onContabilizada?.(numero);
                    },
                  })
                }
              >
                {contabilizar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                {contabilizar.isPending ? T.contabilizando : T.contabilizar}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
