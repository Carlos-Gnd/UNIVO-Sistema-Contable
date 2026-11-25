import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { crearMovimientoSchema } from "@contable/shared";
import { Campo } from "@/components/campo";
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
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { formatearDinero, hoyIso } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { seriesQuery, useRegistrarMovimiento } from "./kardex-api";
import { TEXTOS_KARDEX } from "./textos";

const T = TEXTOS_KARDEX.movimiento;

interface Props {
  empresaId: string;
  productoId: string;
  sucursalId: string;
  controlaSeries: boolean;
  abierto: boolean;
  onCerrar: () => void;
}

/** Diálogo para registrar una entrada o una salida del producto elegido (HU-65, S3-T80). */
export function DialogoMovimiento(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(a) => !a && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, productoId, sucursalId, controlaSeries, onCerrar }: Props) {
  const [valores, setValores] = useState({
    tipo: "entrada",
    fecha: hoyIso(),
    cantidad: "",
    costoUnitario: "",
    referencia: "",
  });
  const [seriesEntrada, setSeriesEntrada] = useState("");
  const [seriesSalida, setSeriesSalida] = useState<string[]>([]);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const registrar = useRegistrarMovimiento(empresaId);
  const disponibles = useQuery({
    ...seriesQuery(empresaId, productoId, { sucursalId, estado: "en_existencia" }),
    enabled: controlaSeries && valores.tipo === "salida",
  });

  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores(({ [campo]: _quitado, ...resto }) => resto);
  };

  const cambiarTipo = (valor: string) => {
    cambiar("tipo", valor);
    setSeriesEntrada("");
    setSeriesSalida([]);
    setErrores(({ series: _quitado, ...resto }) => resto);
  };

  const numerosSerie = controlaSeries
    ? valores.tipo === "entrada"
      ? seriesEntrada
          .split(/\r?\n/)
          .map((serie) => serie.trim())
          .filter(Boolean)
      : seriesSalida
    : undefined;

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (registrar.isPending) return;
    registrar.reset();
    const r = validarFormulario(crearMovimientoSchema, {
      productoId,
      sucursalId,
      ...valores,
      ...(controlaSeries ? { cantidad: String(numerosSerie?.length ?? 0), series: numerosSerie } : {}),
      costoUnitario: valores.tipo === "entrada" ? valores.costoUnitario : "",
    });
    if (!r.ok) return setErrores(r.errores);
    registrar.mutate(r.datos, {
      onSuccess: () => {
        toast.success(T.registrado);
        onCerrar();
      },
      onError: (e) => e instanceof ErrorApi && setErrores(e.errores),
    });
  }

  const error = (campo: string) => errores[campo]?.[0];
  const errorApi = registrar.error;
  const aviso =
    errores._formulario?.[0] ??
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="mov-tipo" etiqueta={T.tipo} error={error("tipo")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.tipo}
              onChange={(e) => cambiarTipo(e.target.value)}
            >
              <option value="entrada">{T.entrada}</option>
              <option value="salida">{T.salida}</option>
            </NativeSelect>
          )}
        </Campo>
        <Campo id="mov-fecha" etiqueta={T.fecha} error={error("fecha")}>
          {(p) => (
            <Input
              {...p}
              type="date"
              className="h-10"
              value={valores.fecha}
              onChange={(e) => cambiar("fecha", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {controlaSeries ? (
          <Campo id="mov-series-cantidad" etiqueta={T.cantidad} error={error("cantidad") ?? error("series")}>
            {() => (
              <p className="h-10 content-center text-sm">{T.unidadesSerie(numerosSerie?.length ?? 0)}</p>
            )}
          </Campo>
        ) : (
          <Campo id="mov-cantidad" etiqueta={T.cantidad} error={error("cantidad")}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                className="h-10 tabular-nums"
                value={valores.cantidad}
                onChange={(e) => cambiar("cantidad", e.target.value)}
              />
            )}
          </Campo>
        )}
        {valores.tipo === "entrada" && (
          <Campo id="mov-costo" etiqueta={T.costoUnitario} error={error("costoUnitario")}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                className="h-10 tabular-nums"
                value={valores.costoUnitario}
                onChange={(e) => cambiar("costoUnitario", e.target.value)}
              />
            )}
          </Campo>
        )}
      </div>
      {controlaSeries && valores.tipo === "entrada" && (
        <Campo
          id="mov-series-entrada"
          etiqueta={T.seriesEntrada}
          ayuda={T.seriesEntradaAyuda}
          error={error("series")}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              value={seriesEntrada}
              onChange={(e) => {
                setSeriesEntrada(e.target.value);
                setErrores(({ series: _quitado, ...resto }) => resto);
              }}
            />
          )}
        </Campo>
      )}
      {controlaSeries && valores.tipo === "salida" && (
        <Campo id="mov-series-salida" etiqueta={T.seriesSalida} error={error("series")}>
          {() => (
            <div className="grid max-h-48 gap-2 overflow-auto rounded-md border border-input p-3">
              {disponibles.isPending && <p role="status">{T.seriesCargando}</p>}
              {disponibles.isError && (
                <Alert variant="error">
                  <p>{T.seriesError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void disponibles.refetch()}
                  >
                    {T.seriesReintentar}
                  </Button>
                </Alert>
              )}
              {disponibles.isSuccess && disponibles.data.length === 0 && <p>{T.seriesVacias}</p>}
              {disponibles.data?.map((serie) => (
                <label key={serie.id} className="flex items-center gap-2 text-sm">
                  <Input
                    type="checkbox"
                    className="size-4"
                    checked={seriesSalida.includes(serie.numeroSerie)}
                    onChange={(e) => {
                      setSeriesSalida((actuales) =>
                        e.target.checked
                          ? [...actuales, serie.numeroSerie]
                          : actuales.filter((numero) => numero !== serie.numeroSerie),
                      );
                      setErrores(({ series: _quitado, ...resto }) => resto);
                    }}
                  />
                  <span>{T.serieCosto(serie.numeroSerie, formatearDinero(serie.costoUnitario))}</span>
                </label>
              ))}
            </div>
          )}
        </Campo>
      )}
      <Campo id="mov-referencia" etiqueta={T.referencia} error={error("referencia")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={60}
            value={valores.referencia}
            onChange={(e) => cambiar("referencia", e.target.value)}
          />
        )}
      </Campo>
      {aviso && <Alert variant="error">{aviso}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={registrar.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={registrar.isPending}>
          {registrar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {registrar.isPending ? T.guardando : T.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
