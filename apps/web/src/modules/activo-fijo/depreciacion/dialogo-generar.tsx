import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Dinero, type VistaDepreciacionMes } from "@contable/shared";
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
import { formatearDinero } from "@/lib/formato";
import { useGenerarDepreciacion } from "./depreciacion-api";
import { nombreDelMes, TEXTOS_DEPRECIACION } from "./textos";

const T = TEXTOS_DEPRECIACION.dialogo;
const dinero = (monto: string) =>
  Dinero.de(monto).esCero() ? "" : formatearDinero(monto, { simbolo: false });

interface DialogoGenerarProps {
  empresaId: string;
  abierto: boolean;
  vista: VistaDepreciacionMes;
  onCerrar: () => void;
}

/** Confirmación de la depreciación del mes: muestra las partidas de ajuste que se contabilizarán (S3-T131, HU-82). */
export function DialogoGenerar({ empresaId, abierto, vista, onCerrar }: DialogoGenerarProps) {
  const generar = useGenerarDepreciacion(empresaId);
  const mes = nombreDelMes(vista.mes);

  function cerrar() {
    if (generar.isPending) return;
    generar.reset();
    onCerrar();
  }

  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && cerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{T.titulo}</DialogTitle>
          <DialogDescription>{T.descripcion(mes)}</DialogDescription>
        </DialogHeader>

        {vista.partidas.map((p) => (
          <section key={p.sucursalId} aria-label={T.partida(p.sucursalNombre)} className="grid gap-2">
            {vista.partidas.length > 1 && (
              <h3 className="text-sm font-semibold">{T.partida(p.sucursalNombre)}</h3>
            )}
            <p className="text-xs text-muted-foreground">{p.concepto}</p>
            <table className="w-full overflow-hidden rounded-2xl bg-muted/40 text-sm">
              <thead className="sr-only">
                <tr>
                  <th>{T.cuenta}</th>
                  <th>{T.debe}</th>
                  <th>{T.haber}</th>
                </tr>
              </thead>
              <tbody>
                {p.lineas.map((l) => (
                  <tr key={`${l.cuentaId}-${l.debe}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="tabular-nums text-muted-foreground">{l.codigo}</span> {l.nombre}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{dinero(l.debe)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{dinero(l.haber)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {generar.isError && <Alert variant="error">{mensajeDeError(generar.error)}</Alert>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar} disabled={generar.isPending}>
            {T.cancelar}
          </Button>
          <Button
            type="button"
            disabled={generar.isPending}
            onClick={() =>
              generar.mutate(vista.mes, {
                onSuccess: (r) => {
                  toast.success(T.exito(mes, r.partidas.length));
                  onCerrar();
                },
              })
            }
          >
            {generar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {generar.isPending ? T.generando : T.confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
