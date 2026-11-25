import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  diaDeLaSemana,
  mesSiguiente,
  ultimoDiaDelMes,
  type EstadoVencimiento,
  type Vencimiento,
} from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mensajeDeError } from "@/lib/api";
import { formatearFecha, hoyIso } from "@/lib/formato";
import { Permiso } from "@/modules/organizacion/permisos";
import { calendarioQuery, useMarcarPresentada } from "./calendario-api";
import { DIAS_SEMANA, ESTADOS, MESES, TEXTOS_CALENDARIO as T } from "./textos";

const mesAnterior = (mes: string) => {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
const nombreDelMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;

/** Color del punto de un día: pendiente y próxima llevan el color principal; la presentada, el apagado. */
const colorPunto = (e: EstadoVencimiento, elegido: boolean) =>
  e === "presentada"
    ? elegido
      ? "bg-primary-foreground/40"
      : "bg-muted-foreground/60"
    : e === "vencida"
      ? "bg-destructive"
      : elegido
        ? "bg-primary-foreground"
        : "bg-primary";

function FilaVencimiento({ vencimiento: v, empresaId }: { vencimiento: Vencimiento; empresaId: string }) {
  const marcar = useMarcarPresentada(empresaId);
  const presentada = v.estado === "presentada";

  return (
    <li className="flex items-start gap-3 border-b border-border px-5 py-4 last:border-0">
      <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">
        {formatearFecha(v.fecha).slice(0, 5)}
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <b className="font-semibold">{v.titulo}</b>
        <span className="text-xs text-muted-foreground">
          {presentada
            ? T.marcar.presentadaEl(formatearFecha(v.presentadaEn ?? ""))
            : T.lista.restan(v.diasRestantes)}
          {v.nota ? ` · ${v.nota}` : ""}
        </span>
        <Permiso requiere="declaraciones.generar">
          <button
            type="button"
            disabled={marcar.isPending}
            aria-label={presentada ? T.marcar.etiquetaQuitar(v.titulo) : T.marcar.etiqueta(v.titulo)}
            onClick={() =>
              marcar.mutate(
                { obligacion: v.obligacion, periodo: v.periodo, presentada: !presentada },
                {
                  onSuccess: () =>
                    toast.success(presentada ? T.marcar.quitada(v.titulo) : T.marcar.exito(v.titulo)),
                },
              )
            }
            className="w-fit text-xs font-semibold underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            {presentada ? T.marcar.quitar : T.marcar.presentada}
          </button>
        </Permiso>
        {marcar.isError && (
          <span role="alert" className="text-xs text-destructive">
            {mensajeDeError(marcar.error)}
          </span>
        )}
      </div>
      <Badge
        variant={v.estado === "presentada" ? "neutra" : "contorno"}
        className={cn(v.estado === "vencida" && "border-destructive text-destructive")}
      >
        {v.estado === "presentada" && <CircleCheck aria-hidden="true" className="size-3.5" />}
        {ESTADOS[v.estado]}
      </Badge>
    </li>
  );
}

/** Calendario tributario mensual con los vencimientos de F-07, F-14 y planillas (S3-T56, HU-52). */
export function PantallaCalendario({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const hoy = hoyIso();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [dia, setDia] = useState<number | null>(null);
  const calendario = useQuery(calendarioQuery(empresaId, mes));

  const vencimientos = calendario.data?.vencimientos ?? [];
  const diasDelMes = Number(ultimoDiaDelMes(`${mes}-01`).slice(8));
  const desplazamiento = (diaDeLaSemana(`${mes}-01`) + 6) % 7; // la semana empieza en lunes
  const delDia = (d: number) => vencimientos.filter((v) => Number(v.fecha.slice(8)) === d);
  const lista = dia ? delDia(dia) : vencimientos;
  const nombre = nombreDelMes(mes);

  function cambiarMes(nuevo: string) {
    setMes(nuevo);
    setDia(null);
  }

  return (
    <Pagina className="max-w-[1100px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      <Alert>{T.aviso}</Alert>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <button
              type="button"
              aria-label={T.mesAnterior}
              onClick={() => cambiarMes(mesAnterior(mes))}
              className="grid size-9 place-items-center rounded-full border border-input focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <h2 className="text-base font-semibold">
              {nombre} {mes.slice(0, 4)}
            </h2>
            <button
              type="button"
              aria-label={T.mesSiguiente}
              onClick={() => cambiarMes(mesSiguiente(mes))}
              className="grid size-9 place-items-center rounded-full border border-input focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className="p-3 sm:p-4">
            <div className="mb-1 grid grid-cols-7 text-center text-xs font-bold tracking-[.08em] text-muted-foreground uppercase">
              {DIAS_SEMANA.map((d) => (
                <span key={d} className="py-2">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: desplazamiento }, (_, i) => (
                <span key={`v${i}`} />
              ))}
              {Array.from({ length: diasDelMes }, (_, i) => {
                const d = i + 1;
                const eventos = delDia(d);
                const esHoy = `${mes}-${String(d).padStart(2, "0")}` === hoy;
                const elegido = dia === d;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={elegido}
                    aria-label={T.dia(d, nombre.toLowerCase(), eventos.length)}
                    onClick={() => setDia(elegido ? null : d)}
                    className={cn(
                      "grid aspect-square content-between justify-items-center rounded-xl border py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:aspect-[4/3]",
                      elegido
                        ? "border-primary bg-primary text-primary-foreground"
                        : esHoy
                          ? "border-muted-foreground"
                          : eventos.length
                            ? "border-input bg-secondary/40 hover:bg-secondary"
                            : "border-transparent hover:bg-secondary",
                    )}
                  >
                    <span className={cn("tabular-nums", esHoy && !elegido && "font-bold")}>{d}</span>
                    <span className="flex h-2 gap-0.5">
                      {eventos.slice(0, 3).map((v) => (
                        <i
                          key={v.obligacion}
                          className={cn("size-1.5 rounded-full", colorPunto(v.estado, elegido))}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i className="size-1.5 rounded-full bg-primary" />
                {T.leyenda.pendiente}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-1.5 rounded-full bg-muted-foreground/60" />
                {T.leyenda.presentada}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-1.5 rounded-full bg-destructive" />
                {T.leyenda.vencida}
              </span>
              <span>{T.hoy(formatearFecha(hoy))}</span>
            </p>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">
              {dia ? T.lista.delDia(dia, nombre.toLowerCase()) : T.lista.delMes(nombre.toLowerCase())}
            </h2>
            {dia && (
              <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setDia(null)}>
                {T.lista.verTodo}
              </Button>
            )}
          </div>
          {calendario.isPending && (
            <p role="status" className="p-5 text-muted-foreground">
              {T.cargando}
            </p>
          )}
          {calendario.isError && (
            <Alert variant="error" className="m-4">
              <p>
                {T.errorCarga} {mensajeDeError(calendario.error)}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void calendario.refetch()}>
                {T.reintentar}
              </Button>
            </Alert>
          )}
          {calendario.isSuccess && (
            <ul>
              {lista.map((v) => (
                <FilaVencimiento key={`${v.obligacion}-${v.periodo}`} vencimiento={v} empresaId={empresaId} />
              ))}
              {lista.length === 0 && (
                <li className="p-10 text-center text-muted-foreground">{T.lista.vacio}</li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </Pagina>
  );
}
