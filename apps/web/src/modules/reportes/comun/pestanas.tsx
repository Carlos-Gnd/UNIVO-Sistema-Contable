import type { KeyboardEvent } from "react";
import { cn } from "cn";

interface PestanasProps<V extends string> {
  etiqueta: string;
  valor: V;
  opciones: readonly { valor: V; texto: string }[];
  onCambio: (valor: V) => void;
  /** id del panel que controlan las pestañas */
  idPanel: string;
}

/** Pestañas accesibles: flechas izquierda y derecha, Inicio y Fin para cambiar de opción. */
export function Pestanas<V extends string>({
  etiqueta,
  valor,
  opciones,
  onCambio,
  idPanel,
}: PestanasProps<V>) {
  function alPresionar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const destino =
      evento.key === "ArrowRight"
        ? (indice + 1) % opciones.length
        : evento.key === "ArrowLeft"
          ? (indice - 1 + opciones.length) % opciones.length
          : evento.key === "Home"
            ? 0
            : evento.key === "End"
              ? opciones.length - 1
              : null;
    if (destino === null) return;
    evento.preventDefault();
    const elegida = opciones[destino];
    if (!elegida) return;
    onCambio(elegida.valor);
    document.getElementById(`pestana-${elegida.valor}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
    >
      {opciones.map((o, i) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            id={`pestana-${o.valor}`}
            type="button"
            role="tab"
            aria-selected={activa}
            aria-controls={idPanel}
            tabIndex={activa ? 0 : -1}
            onClick={() => onCambio(o.valor)}
            onKeyDown={(e) => alPresionar(e, i)}
            className={cn(
              "-mb-px flex h-11 items-center border-b-2 px-4 font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              activa
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
