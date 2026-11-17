import { CircleAlert, CircleCheck } from "lucide-react";
import { Dinero } from "@contable/shared";
import { formatearDinero } from "@/lib/formato";
import { TEXTOS_PARTIDA } from "./textos";

const T = TEXTOS_PARTIDA.totales;

/**
 * Estado del cuadre que se actualiza al escribir cada monto (S1-T81). Se anuncia a los lectores de
 * pantalla sin interrumpir (aria-live polite).
 */
export function EstadoCuadre({
  lineas,
  totalDebe,
  totalHaber,
  diferencia,
}: {
  lineas: number;
  totalDebe: string;
  totalHaber: string;
  diferencia: string;
}) {
  const descuadre = !Dinero.de(diferencia).esCero();
  const sinMontos = Dinero.de(totalDebe).esCero() && Dinero.de(totalHaber).esCero();
  return (
    <div aria-live="polite" data-testid="estado-cuadre">
      {lineas < 2 ? (
        <span className="text-sm text-muted-foreground">{T.minimoDos}</span>
      ) : sinMontos ? (
        <span className="text-sm text-muted-foreground">{T.sinMontos}</span>
      ) : descuadre ? (
        <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--destructive-background)] px-3.5 py-1.5 text-sm font-semibold text-destructive">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {T.diferencia(formatearDinero(diferencia))}
        </span>
      ) : (
        <span className="inline-flex h-9 items-center gap-2 rounded-full bg-secondary px-3.5 text-sm font-semibold text-foreground">
          <CircleCheck aria-hidden="true" className="size-4" />
          {T.cuadra}
        </span>
      )}
    </div>
  );
}
