import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Plus, Search } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buscarCuentas } from "./lineas";
import { TEXTOS_PARTIDA } from "./textos";
import type { CuentaParaPartida } from "./tipos";

const T = TEXTOS_PARTIDA.detalle;

interface BuscadorCuentasProps {
  cuentas: readonly CuentaParaPartida[];
  onElegir: (cuenta: CuentaParaPartida) => void;
  disabled?: boolean;
}

/**
 * «Agregar cuenta»: abre un buscador (combobox con lista) que filtra el catálogo por código o nombre.
 * Se maneja con teclado: flechas para moverse, Enter para elegir y Escape para cerrar (S1-T80).
 */
export function BuscadorCuentas({ cuentas, onElegir, disabled }: BuscadorCuentasProps) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [activa, setActiva] = useState(0);
  const idLista = useId();
  const opciones = useMemo(() => buscarCuentas(cuentas, consulta), [cuentas, consulta]);
  const idOpcion = (i: number) => `${idLista}-${i}`;

  function cambiarApertura(valor: boolean) {
    setAbierto(valor);
    if (!valor) {
      setConsulta("");
      setActiva(0);
    }
  }

  function elegir(cuenta: CuentaParaPartida) {
    onElegir(cuenta);
    cambiarApertura(false);
  }

  function alPresionar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setActiva((i) => Math.min(i + 1, opciones.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const cuenta = opciones[activa];
      if (cuenta) elegir(cuenta);
    }
  }

  return (
    <Popover open={abierto} onOpenChange={cambiarApertura}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="-ml-3 inline-flex h-9 items-center gap-2 rounded-full px-3 font-semibold text-foreground hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        >
          <Plus aria-hidden="true" className="size-4" />
          {T.agregar}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={T.agregar}>
        <div className="relative m-1 mb-2">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={opciones.length ? idOpcion(activa) : undefined}
            aria-label={T.buscar}
            placeholder={T.buscar}
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setActiva(0);
            }}
            onKeyDown={alPresionar}
            className="h-10 w-full rounded-full border border-input bg-background pr-3 pl-10 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        </div>
        <ul id={idLista} role="listbox" aria-label={T.cuenta} className="max-h-72 overflow-y-auto">
          {opciones.map((c, i) => (
            <li
              key={c.id}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activa}
              onMouseEnter={() => setActiva(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(c)}
              className={cn(
                "flex h-10 cursor-pointer items-center gap-3 rounded-xl px-2.5 text-sm",
                i === activa && "bg-secondary",
              )}
            >
              <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{c.codigo}</span>
              <span className="flex-1 truncate">{c.nombre}</span>
              <span className="text-xs text-muted-foreground">
                {c.naturaleza === "deudora" ? T.deudora : T.acreedora}
              </span>
            </li>
          ))}
        </ul>
        {!opciones.length && (
          <p className="p-4 text-center text-sm text-muted-foreground">{T.sinResultados(consulta)}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
