import { useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, CalendarRange } from "lucide-react";
import { cn } from "cn";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatearFecha, hoyIso } from "@/lib/formato";
import { mensajeDeError } from "@/lib/api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { DialogoCrearEjercicio } from "./dialogo-crear-ejercicio";
import { ejercicioInicial, ejerciciosQuery } from "./periodos-api";
import { MESES, TEXTOS_PERIODOS as T } from "./textos";
import type { EjercicioDetalle, PeriodoDetalle } from "./tipos";

/** Pestañas accesibles: flechas izquierda y derecha, Inicio y Fin para cambiar de ejercicio. */
function PestanasEjercicios({
  ejercicios,
  seleccionado,
  onElegir,
}: {
  ejercicios: readonly EjercicioDetalle[];
  seleccionado: number;
  onElegir: (anio: number) => void;
}) {
  function alPresionar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const destino =
      evento.key === "ArrowRight"
        ? (indice + 1) % ejercicios.length
        : evento.key === "ArrowLeft"
          ? (indice - 1 + ejercicios.length) % ejercicios.length
          : evento.key === "Home"
            ? 0
            : evento.key === "End"
              ? ejercicios.length - 1
              : null;
    if (destino === null) return;
    evento.preventDefault();
    const anio = ejercicios[destino]?.anio;
    if (anio === undefined) return;
    onElegir(anio);
    document.getElementById(`pestana-${anio}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={T.ejercicios}
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
    >
      {ejercicios.map((e, i) => {
        const activo = e.anio === seleccionado;
        return (
          <button
            key={e.id}
            id={`pestana-${e.anio}`}
            type="button"
            role="tab"
            aria-selected={activo}
            aria-controls="panel-periodos"
            tabIndex={activo ? 0 : -1}
            onClick={() => onElegir(e.anio)}
            onKeyDown={(evento) => alPresionar(evento, i)}
            className={cn(
              "-mb-px flex h-11 items-center gap-2 border-b-2 px-4 font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              activo
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {T.ejercicio(e.anio)}
          </button>
        );
      })}
    </div>
  );
}

function TarjetaPeriodo({ periodo, actual }: { periodo: PeriodoDetalle; actual: boolean }) {
  const abierto = periodo.estado === "abierto";
  const nombre = MESES[periodo.mes - 1] ?? String(periodo.mes);
  return (
    <li>
      <Card
        className={cn("grid min-w-0 gap-3 p-3 sm:p-4", actual && "border-ring")}
        aria-current={actual ? "date" : undefined}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">{nombre}</h3>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {formatearFecha(periodo.fechaInicio)} – {formatearFecha(periodo.fechaFin)}
            </span>
          </div>
          <Badge variant={abierto ? "contorno" : "neutra"}>{abierto ? T.abierto : T.cerrado}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {actual && <span className="font-semibold text-foreground">{T.actual}</span>}
          {!abierto && periodo.cerradoEn && <span>{T.cerradoEl(formatearFecha(periodo.cerradoEn))}</span>}
          {abierto && periodo.motivoReapertura && <span title={periodo.motivoReapertura}>{T.reabierto}</span>}
        </div>
      </Card>
    </li>
  );
}

/** Pantalla de ejercicios y sus doce períodos con su estado (S1-T75, HU-19). */
export function PantallaPeriodos({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const ejercicios = useQuery(ejerciciosQuery(empresaId));
  // Crear ejercicios es una tarea del administrador (HU-19): se usa el permiso de configurar la empresa
  const puedeCrear = usePermiso("empresa.configurar");
  const hoy = hoyIso();
  const anioActual = Number(hoy.slice(0, 4));
  const [elegido, setElegido] = useState<number>();
  const [crear, setCrear] = useState(false);

  const lista = [...(ejercicios.data ?? [])].sort((a, b) => b.anio - a.anio);
  const seleccionado = elegido ?? ejercicioInicial(lista, anioActual);
  const ejercicio = lista.find((e) => e.anio === seleccionado);
  const periodos = [...(ejercicio?.periodos ?? [])].sort((a, b) => a.mes - b.mes);
  const anios = lista.map((e) => e.anio);
  const anioSugerido = anios.includes(anioActual) ? Math.max(...anios) + 1 : anioActual;

  const botonCrear = puedeCrear && (
    <Button className="h-11 rounded-full px-5" onClick={() => setCrear(true)}>
      <CalendarPlus aria-hidden="true" />
      {T.crear}
    </Button>
  );

  return (
    <Pagina>
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {ejercicios.isSuccess && lista.length > 0 && botonCrear}
      </EncabezadoPagina>

      {ejercicios.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {ejercicios.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(ejercicios.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void ejercicios.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {ejercicios.isSuccess && lista.length === 0 && (
        <Card className="grid justify-items-center gap-3 p-14 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-secondary">
            <CalendarRange className="size-6" />
          </span>
          <h2 className="text-lg text-foreground">{T.vacioTitulo}</h2>
          <p className="max-w-md text-muted-foreground">{puedeCrear ? T.vacio : T.vacioSinPermiso}</p>
          {botonCrear}
        </Card>
      )}

      {ejercicio && seleccionado !== undefined && (
        <>
          <PestanasEjercicios ejercicios={lista} seleccionado={seleccionado} onElegir={setElegido} />
          <div id="panel-periodos" role="tabpanel" aria-labelledby={`pestana-${seleccionado}`}>
            <h2 className="sr-only">{T.periodos(seleccionado)}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {periodos.map((p) => (
                <TarjetaPeriodo key={p.id} periodo={p} actual={p.fechaInicio <= hoy && hoy <= p.fechaFin} />
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">{T.notaCierre}</p>
        </>
      )}

      <DialogoCrearEjercicio
        empresaId={empresaId}
        abierto={crear}
        anioSugerido={anioSugerido}
        aniosExistentes={anios}
        onCerrar={() => setCrear(false)}
        onCreado={(anio) => {
          setCrear(false);
          setElegido(anio);
        }}
      />
    </Pagina>
  );
}
