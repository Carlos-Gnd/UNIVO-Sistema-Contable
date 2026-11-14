import * as React from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type CuentaCatalogoArbol = {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  cuentaPadreId: string | null;
  activa: boolean;
  imputable?: boolean;
};

export type EtiquetasArbolCuentas = {
  titulo: string;
  expandirTodo: string;
  contraerTodo: string;
  codigo: string;
  cuenta: string;
  estado: string;
  imputable: string;
  vacio: string;
  encabezado: string;
  detalle: string;
  activa: string;
  inactiva: string;
  expandirCuenta: (nombre: string) => string;
  contraerCuenta: (nombre: string) => string;
};

type ArbolCuentasProps = {
  cuentas: CuentaCatalogoArbol[];
  etiquetas: EtiquetasArbolCuentas;
  className?: string;
};

type NodoCuenta = CuentaCatalogoArbol & { hijos: NodoCuenta[] };

function construirArbol(cuentas: CuentaCatalogoArbol[]): NodoCuenta[] {
  const nodos = new Map<string, NodoCuenta>();
  for (const cuenta of cuentas) nodos.set(cuenta.id, { ...cuenta, hijos: [] });
  const raices: NodoCuenta[] = [];

  for (const nodo of nodos.values()) {
    const padre = nodo.cuentaPadreId ? nodos.get(nodo.cuentaPadreId) : undefined;
    if (padre && padre.id !== nodo.id) padre.hijos.push(nodo);
    else raices.push(nodo);
  }

  const ordenar = (items: NodoCuenta[]) => {
    items.sort((izquierda, derecha) =>
      izquierda.codigo.localeCompare(derecha.codigo, undefined, { numeric: true }),
    );
    items.forEach((item) => ordenar(item.hijos));
  };
  ordenar(raices);

  // Mantén visibles las cuentas huérfanas para no ocultar datos inconsistentes.
  const alcanzables = new Set<string>();
  const marcar = (items: NodoCuenta[]) =>
    items.forEach((item) => {
      if (alcanzables.has(item.id)) return;
      alcanzables.add(item.id);
      marcar(item.hijos);
    });
  marcar(raices);
  const huerfanas = [...nodos.values()].filter((nodo) => !alcanzables.has(nodo.id));
  if (huerfanas.length) {
    for (const huerfana of huerfanas) {
      huerfana.hijos = huerfana.hijos.filter((hijo) => hijo.id !== huerfana.id);
    }
    raices.push(...huerfanas.filter((nodo) => !huerfanas.some((otra) => otra.hijos.includes(nodo))));
    ordenar(raices);
  }

  return raices;
}

function obtenerIdsExpandibles(nodos: NodoCuenta[]): string[] {
  return nodos.flatMap((nodo) => [
    ...(nodo.hijos.length ? [nodo.id] : []),
    ...obtenerIdsExpandibles(nodo.hijos),
  ]);
}

function ArbolCuentas({ cuentas, etiquetas, className }: ArbolCuentasProps) {
  const arbol = React.useMemo(() => construirArbol(cuentas), [cuentas]);
  const idsExpandibles = React.useMemo(() => obtenerIdsExpandibles(arbol), [arbol]);
  const idsRaiz = React.useMemo(
    () => new Set(arbol.filter((nodo) => nodo.hijos.length).map((nodo) => nodo.id)),
    [arbol],
  );
  const [expansionGlobal, setExpansionGlobal] = React.useState<"predeterminada" | "abierta" | "cerrada">(
    "predeterminada",
  );
  const [cambiosExpansiones, setCambiosExpansiones] = React.useState<Map<string, boolean>>(() => new Map());
  const idsAbiertosValidos = React.useMemo(
    () =>
      new Set(
        idsExpandibles.filter((id) => {
          const cambio = cambiosExpansiones.get(id);
          if (cambio !== undefined) return cambio;
          return expansionGlobal === "abierta" || (expansionGlobal === "predeterminada" && idsRaiz.has(id));
        }),
      ),
    [cambiosExpansiones, expansionGlobal, idsExpandibles, idsRaiz],
  );

  const alternar = (id: string) => {
    setCambiosExpansiones((current) => {
      const next = new Map(current);
      next.set(id, !idsAbiertosValidos.has(id));
      return next;
    });
  };

  const expandirTodo = () => {
    setExpansionGlobal("abierta");
    setCambiosExpansiones(new Map());
  };

  const contraerTodo = () => {
    setExpansionGlobal("cerrada");
    setCambiosExpansiones(new Map());
  };

  const manejarTeclas = (evento: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(evento.key)) return;
    const fila = evento.currentTarget;
    const filas = Array.from(
      fila.closest('[role="treegrid"]')?.querySelectorAll<HTMLTableRowElement>("tbody tr[aria-level]") ?? [],
    );
    const indice = filas.indexOf(fila);
    let destino: HTMLTableRowElement | undefined;

    if (evento.key === "ArrowDown") destino = filas[indice + 1];
    if (evento.key === "ArrowUp") destino = filas[indice - 1];
    if (evento.key === "ArrowRight") {
      if (fila.getAttribute("aria-expanded") === "false") {
        fila.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click();
      } else {
        const siguiente = filas[indice + 1];
        if (
          siguiente &&
          Number(siguiente.getAttribute("aria-level")) > Number(fila.getAttribute("aria-level"))
        ) {
          destino = siguiente;
        }
      }
    }
    if (evento.key === "ArrowLeft") {
      if (fila.getAttribute("aria-expanded") === "true") {
        fila.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click();
      } else {
        const nivelActual = Number(fila.getAttribute("aria-level"));
        for (let i = indice - 1; i >= 0; i -= 1) {
          const candidata = filas[i];
          if (candidata && Number(candidata.getAttribute("aria-level")) < nivelActual) {
            destino = candidata;
            break;
          }
        }
      }
    }

    evento.preventDefault();
    destino?.focus();
  };

  let indiceFila = 0;
  const renderizarFilas = (nodos: NodoCuenta[], profundidad = 0): React.ReactNode =>
    nodos.map((nodo) => {
      const tieneHijos = nodo.hijos.length > 0;
      const expandido = idsAbiertosValidos.has(nodo.id);
      const indiceActual = indiceFila++;
      return (
        <React.Fragment key={nodo.id}>
          <TableRow
            aria-level={profundidad + 1}
            aria-expanded={tieneHijos ? expandido : undefined}
            tabIndex={indiceActual === 0 ? 0 : -1}
            onKeyDown={manejarTeclas}
          >
            <TableCell className="font-mono tabular-nums">{nodo.codigo}</TableCell>
            <TableCell>
              <div
                className="flex min-w-0 items-center gap-1"
                style={{ paddingInlineStart: `${profundidad * 1.25}rem` }}
              >
                {tieneHijos ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      expandido
                        ? etiquetas.contraerCuenta(nodo.nombre)
                        : etiquetas.expandirCuenta(nodo.nombre)
                    }
                    aria-expanded={expandido}
                    tabIndex={-1}
                    onClick={() => alternar(nodo.id)}
                  >
                    {expandido ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                  </Button>
                ) : (
                  <span aria-hidden="true" className="inline-block size-6 shrink-0" />
                )}
                <span className="truncate">{nodo.nombre}</span>
              </div>
            </TableCell>
            <TableCell>
              {(nodo.imputable ?? !tieneHijos) ? (
                <span className="rounded-md border border-border px-2 py-0.5 text-xs">
                  {etiquetas.imputable}
                </span>
              ) : (
                <span className="text-muted-foreground">{etiquetas.encabezado}</span>
              )}
            </TableCell>
            <TableCell>
              <span className={nodo.activa ? "text-foreground" : "text-muted-foreground"}>
                {nodo.activa ? etiquetas.activa : etiquetas.inactiva}
              </span>
            </TableCell>
          </TableRow>
          {tieneHijos && expandido && renderizarFilas(nodo.hijos, profundidad + 1)}
        </React.Fragment>
      );
    });

  return (
    <section className={className} aria-label={etiquetas.titulo}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <FolderTree aria-hidden="true" className="size-5" />
          {etiquetas.titulo}
        </h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={expandirTodo}>
            {etiquetas.expandirTodo}
          </Button>
          <Button type="button" variant="outline" onClick={contraerTodo}>
            {etiquetas.contraerTodo}
          </Button>
        </div>
      </div>

      <Table role="treegrid" aria-label={etiquetas.titulo}>
        <TableHeader>
          <TableRow>
            <TableHead>{etiquetas.codigo}</TableHead>
            <TableHead>{etiquetas.cuenta}</TableHead>
            <TableHead>{etiquetas.detalle}</TableHead>
            <TableHead>{etiquetas.estado}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {arbol.length ? (
            renderizarFilas(arbol)
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                {etiquetas.vacio}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}

export { ArbolCuentas };
