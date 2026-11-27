import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearDinero } from "@/lib/formato";
import { seriesQuery } from "@/modules/inventario/kardex/kardex-api";
import { TEXTOS_VENTAS } from "./textos";

const T = TEXTOS_VENTAS.formulario;

interface Props {
  empresaId: string;
  productoId: string;
  sucursalId: string;
  /** Números de serie elegidos en esta línea */
  seleccion: readonly string[];
  /** Series ya elegidas en otras líneas del mismo producto: no pueden venderse dos veces */
  ocupadas: ReadonlySet<string>;
  etiqueta: string;
  onCambiar: (series: string[]) => void;
}

/** Lista de las series en existencia de un producto, para elegir cuáles salen en una línea de venta (HU-66). */
export function SelectorSeriesVenta({
  empresaId,
  productoId,
  sucursalId,
  seleccion,
  ocupadas,
  etiqueta,
  onCambiar,
}: Props) {
  const disponibles = useQuery({
    ...seriesQuery(empresaId, productoId, { sucursalId, estado: "en_existencia" }),
    enabled: Boolean(productoId && sucursalId),
  });

  return (
    <fieldset className="grid gap-2 rounded-md border border-input p-3" aria-label={etiqueta}>
      <legend className="px-1 text-xs font-medium text-muted-foreground">{T.seriesElegir}</legend>
      {!sucursalId && <p className="text-sm">{T.seriesSinSucursal}</p>}
      {disponibles.isPending && sucursalId && <p role="status">{T.seriesCargando}</p>}
      {disponibles.isError && (
        <Alert variant="error">
          <p>{T.seriesError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void disponibles.refetch()}>
            {T.seriesReintentar}
          </Button>
        </Alert>
      )}
      {disponibles.isSuccess && disponibles.data.length === 0 && <p className="text-sm">{T.seriesVacias}</p>}
      <div className="grid max-h-40 gap-2 overflow-auto">
        {disponibles.data?.map((serie) => {
          const marcada = seleccion.includes(serie.numeroSerie);
          return (
            <label key={serie.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={marcada}
                disabled={!marcada && ocupadas.has(serie.numeroSerie)}
                onChange={(e) =>
                  onCambiar(
                    e.target.checked
                      ? [...seleccion, serie.numeroSerie]
                      : seleccion.filter((numero) => numero !== serie.numeroSerie),
                  )
                }
              />
              <span>{T.serieCosto(serie.numeroSerie, formatearDinero(serie.costoUnitario))}</span>
            </label>
          );
        })}
      </div>
      {seleccion.length > 0 && (
        <p className="text-xs text-muted-foreground">{T.seriesCantidad(seleccion.length)}</p>
      )}
    </fieldset>
  );
}
