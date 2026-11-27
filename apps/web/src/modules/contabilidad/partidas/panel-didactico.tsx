import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Dinero } from "@contable/shared";
import type { ExplicacionDidacticaPartida } from "@contable/shared";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { formatearDinero } from "@/lib/formato";
import { guardarModoDidactico, modoDidacticoQuery } from "./didactico-api";
import { TEXTOS_PARTIDA } from "./textos";
import type { LineaPartidaVista } from "./tipos";

const T = TEXTOS_PARTIDA.didactico;

function Interruptor({
  activo,
  deshabilitado,
  onCambiar,
}: {
  activo: boolean;
  deshabilitado: boolean;
  onCambiar: (activo: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={T.interruptor}
      disabled={deshabilitado}
      onClick={() => onCambiar(!activo)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border border-border transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
        activo ? "bg-primary" : "bg-secondary",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.5 left-0.5 size-4.5 rounded-full bg-background shadow-sm transition-transform",
          activo && "translate-x-5",
        )}
      />
    </button>
  );
}

function EsquemaT({ esquema }: { esquema: ExplicacionDidacticaPartida["esquemaT"] }) {
  const lados = [
    { titulo: T.debe, movimientos: esquema.debe },
    { titulo: T.haber, movimientos: esquema.haber },
  ];
  return (
    <section aria-label={T.esquemaTitulo} className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-2 divide-x divide-border">
        {lados.map(({ titulo, movimientos }) => {
          const suma = Dinero.sumar(movimientos.map((m) => m.monto));
          return (
            <div key={titulo} className="min-w-0">
              <h4 className="border-b border-border px-3 py-2 text-center text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {titulo}
              </h4>
              <ul aria-label={titulo} className="divide-y divide-border">
                {movimientos.map((m, i) => (
                  <li
                    key={`${m.codigo}-${i}`}
                    className="flex min-h-10 items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {m.codigo} {m.nombre}
                    </span>
                    <span className="whitespace-nowrap tabular-nums">
                      {formatearDinero(m.monto, { simbolo: false })}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex min-h-10 items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm font-semibold">
                <span>{T.suma}</span>
                <span className="tabular-nums" data-testid={`suma-${titulo.toLowerCase()}`}>
                  {formatearDinero(suma.aTexto(), { simbolo: false })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Panel didáctico de una partida automática (HU-89, S4-T38): con el modo activo muestra por qué se hizo, qué
 * hace cada línea y su esquema T. El interruptor guarda la preferencia en el perfil del usuario.
 */
export function PanelDidactico({
  explicacion,
  lineas,
}: {
  explicacion: ExplicacionDidacticaPartida;
  lineas: readonly LineaPartidaVista[];
}) {
  const cliente = useQueryClient();
  const preferencia = useQuery(modoDidacticoQuery());
  const guardar = useMutation({
    mutationFn: guardarModoDidactico,
    onSuccess: (guardada) => cliente.setQueryData(modoDidacticoQuery().queryKey, guardada),
    onError: () => toast.error(T.errorGuardar),
  });
  const activo = preferencia.data?.activo ?? false;
  const lineaDe = (cuentaId: string) => lineas.find((l) => l.cuentaId === cuentaId);

  return (
    <Card className="overflow-hidden">
      <CardHeader title={T.titulo} description={T.ayuda}>
        <Interruptor
          activo={guardar.isPending ? (guardar.variables ?? activo) : activo}
          deshabilitado={preferencia.isPending || guardar.isPending}
          onCambiar={(valor) => guardar.mutate(valor)}
        />
      </CardHeader>
      {preferencia.isPending ? null : !activo ? (
        <div className="p-5">
          <Alert>{T.apagado}</Alert>
        </div>
      ) : (
        <div className="grid gap-5 p-5">
          <div>
            <h3 className="font-semibold">{T.reglaTitulo}</h3>
            <p className="mt-1">
              <b className="font-semibold">{explicacion.regla.nombre}.</b> {explicacion.regla.explicacion}
            </p>
          </div>
          <div>
            <h3 className="font-semibold">{T.lineasTitulo}</h3>
            <ul className="mt-2 grid gap-2.5">
              {explicacion.lineas.map((l, i) => {
                const linea = lineaDe(l.cuentaId);
                return (
                  <li key={`${l.cuentaId}-${i}`} className="flex gap-3 text-sm">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check size={14} aria-hidden="true" />
                    </span>
                    <span>
                      <b className="font-semibold tabular-nums">
                        {linea ? `${linea.codigo} · ${linea.nombre}` : l.cuentaId} · {T.lado[l.lado]}
                      </b>
                      <span className="block text-muted-foreground">{l.explicacion}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <EsquemaT esquema={explicacion.esquemaT} />
        </div>
      )}
    </Card>
  );
}
