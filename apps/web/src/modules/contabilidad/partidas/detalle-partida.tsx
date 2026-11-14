import type { ErrorLinea, ResultadoValidacion } from "@contable/shared";
import { X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatearDinero } from "@/lib/formato";
import { BuscadorCuentas } from "./buscador-cuentas";
import { limpiarMonto, pulirMonto, type FilaPartida } from "./lineas";
import { TEXTOS_PARTIDA } from "./textos";
import type { CuentaParaPartida } from "./tipos";

const T = TEXTOS_PARTIDA.detalle;
const COLUMNAS = "sm:grid-cols-[110px_minmax(0,1fr)_150px_150px_44px]";

interface DetallePartidaProps {
  filas: readonly FilaPartida[];
  cuentas: readonly CuentaParaPartida[];
  totales: Pick<ResultadoValidacion, "totalDebe" | "totalHaber">;
  /** Errores por línea (locales o devueltos por la API) que ya se deben mostrar */
  errores: readonly ErrorLinea[];
  soloLectura: boolean;
  cuentasDisponibles: boolean;
  onAgregar: (cuenta: CuentaParaPartida) => void;
  onCambiarMonto: (clave: string, lado: "debe" | "haber", valor: string) => void;
  onQuitar: (clave: string) => void;
}

/**
 * Detalle dinámico de la partida (S1-T80): una fila por cuenta con su debe o haber, búsqueda para agregar
 * cuentas y la fila de totales que se recalcula en cada cambio (S1-T81).
 */
export function DetallePartida({
  filas,
  cuentas,
  totales,
  errores,
  soloLectura,
  cuentasDisponibles,
  onAgregar,
  onCambiarMonto,
  onQuitar,
}: DetallePartidaProps) {
  const erroresDe = (i: number) => errores.filter((e) => e.linea === i);

  return (
    <Card className="overflow-hidden">
      <h2 className="sr-only">{T.titulo}</h2>
      <div
        aria-hidden="true"
        className={cn(
          "hidden gap-3 border-b border-border px-5 py-3 text-xs font-bold tracking-[.08em] text-muted-foreground uppercase sm:grid",
          COLUMNAS,
        )}
      >
        <span>{T.codigo}</span>
        <span>{T.cuenta}</span>
        <span className="text-right">{T.debe}</span>
        <span className="text-right">{T.haber}</span>
        <span />
      </div>

      <ul aria-label={T.titulo}>
        {filas.map((f, i) => {
          const nombre = `${f.codigo} ${f.nombre}`;
          const erroresFila = erroresDe(i);
          const idError = `linea-${f.clave}-error`;
          return (
            <li key={f.clave} className="border-b border-border px-5 py-3">
              <div
                className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2", COLUMNAS)}
              >
                <span className="hidden text-muted-foreground tabular-nums sm:block">{f.codigo}</span>
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-muted-foreground tabular-nums sm:hidden">{f.codigo}</span>
                  {f.nombre}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={T.quitar(nombre)}
                  disabled={soloLectura}
                  onClick={() => onQuitar(f.clave)}
                  className="rounded-full text-muted-foreground sm:order-last"
                >
                  <X aria-hidden="true" />
                </Button>
                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:contents">
                  {(["debe", "haber"] as const).map((lado) => {
                    const otro = lado === "debe" ? f.haber : f.debe;
                    return (
                      <Input
                        key={lado}
                        aria-label={lado === "debe" ? T.debeDe(nombre) : T.haberDe(nombre)}
                        aria-invalid={erroresFila.length > 0}
                        aria-describedby={erroresFila.length ? idError : undefined}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={f[lado]}
                        // Una línea va al debe o al haber, no a los dos (regla DEBE_Y_HABER)
                        disabled={soloLectura || otro !== ""}
                        onChange={(e) => onCambiarMonto(f.clave, lado, limpiarMonto(e.target.value))}
                        onBlur={() => onCambiarMonto(f.clave, lado, pulirMonto(f[lado]))}
                        className="h-10 text-right font-semibold tabular-nums disabled:opacity-40"
                      />
                    );
                  })}
                </div>
              </div>
              {erroresFila.length > 0 && (
                <p id={idError} role="alert" className="mt-2 text-sm text-destructive">
                  {erroresFila.map((e) => e.mensaje).join(" ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {!filas.length && (
        <p className="border-b border-border px-5 py-6 text-center text-muted-foreground">{T.vacio}</p>
      )}

      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <BuscadorCuentas cuentas={cuentas} onElegir={onAgregar} disabled={!cuentasDisponibles} />
          <span className="text-xs text-muted-foreground">{T.agregarAyuda}</span>
        </div>
      )}

      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-4 font-bold",
          COLUMNAS,
        )}
      >
        <span className="hidden sm:block" />
        <span>{TEXTOS_PARTIDA.totales.totales}</span>
        <span className="text-right text-base tabular-nums" data-testid="total-debe">
          {formatearDinero(totales.totalDebe, { simbolo: false })}
        </span>
        <span className="text-right text-base tabular-nums" data-testid="total-haber">
          {formatearDinero(totales.totalHaber, { simbolo: false })}
        </span>
      </div>
    </Card>
  );
}
