import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import type { ConsultaSeries } from "@contable/shared";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { cuentasQuery, sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { toast } from "sonner";
import { productosQuery } from "../productos/productos-api";
import { seriesQuery } from "../kardex/kardex-api";
import { unidades } from "../kardex/formato";
import {
  aprobarTomaFisica,
  claveTomaFisica,
  guardarConteoTomaFisica,
  inventarioAnaliticoQuery,
  iniciarTomaFisica,
  reabastecimientoQuery,
  tomaFisicaQuery,
} from "./toma-fisica-api";
import { TEXTOS_TOMA_FISICA as T } from "./textos";

const TODOS = { busqueda: "", categoriaId: "", estado: "todos" } as const;
type Pestana = "conteo" | "series" | "reabastecimiento" | "analitico";

/** Pestañas de series y reabastecimiento de la toma física y control de inventario (HU-66, HU-67). */
export function PantallaSeries({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("inventario.ver");
  const puedeContar = usePermiso("inventario.contar");
  const puedeAprobar = usePermiso("inventario.aprobar_ajuste");
  const queryClient = useQueryClient();
  const [productoId, setProductoId] = useState("");
  const [sucursalElegida, setSucursalElegida] = useState("");
  const [estado, setEstado] = useState<ConsultaSeries["estado"]>("todas");
  const [pestanaActual, setPestanaActual] = useState<Pestana>("conteo");
  const [fechaToma, setFechaToma] = useState(hoyIso());
  const [desdeAnalitico, setDesdeAnalitico] = useState(() => hoyIso().slice(0, 7) + "-01");
  const [hastaAnalitico, setHastaAnalitico] = useState(() => hoyIso());
  const [sucursalAnaliticaId, setSucursalAnaliticaId] = useState("");
  const [conteos, setConteos] = useState<Record<string, { cantidad: string; series: string }>>({});
  const [costos, setCostos] = useState<Record<string, string>>({});
  const [cuentaFaltantesId, setCuentaFaltantesId] = useState("");
  const [cuentaSobrantesId, setCuentaSobrantesId] = useState("");

  const productos = useQuery({ ...productosQuery(empresaId, TODOS), enabled: puedeVer });
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const productosControlados = useMemo(
    () => (productos.data ?? []).filter((producto) => producto.controlaSeries),
    [productos.data],
  );
  const activas = useMemo(
    () => (sucursales.data ?? []).filter((sucursal) => sucursal.activa),
    [sucursales.data],
  );
  const sucursalId =
    sucursalElegida || activas.find((sucursal) => sucursal.esMatriz)?.id || activas[0]?.id || "";
  const toma = useQuery({
    ...tomaFisicaQuery(empresaId, sucursalId),
    enabled: puedeVer && pestanaActual === "conteo" && Boolean(sucursalId),
  });
  const cuentas = useQuery({
    ...cuentasQuery(empresaId),
    enabled: puedeAprobar && pestanaActual === "conteo",
  });
  const cuentasPadre = useMemo(
    () => new Set((cuentas.data ?? []).map((cuenta: CuentaCatalogo) => cuenta.cuentaPadreId).filter(Boolean)),
    [cuentas.data],
  );
  const cuentasContra = (cuentas.data ?? []).filter(
    (cuenta: CuentaCatalogo) =>
      cuenta.activa &&
      !(cuenta.imputable === false || cuentasPadre.has(cuenta.id)) &&
      cuenta.codigo !== "1109",
  );
  const series = useQuery({
    ...seriesQuery(empresaId, productoId, { sucursalId, estado }),
    enabled: puedeVer && Boolean(productoId) && Boolean(sucursalId),
  });
  const reabastecimiento = useQuery({
    ...reabastecimientoQuery(empresaId, sucursalId),
    enabled: puedeVer && pestanaActual === "reabastecimiento" && Boolean(sucursalId),
  });
  const rangoAnaliticoValido = hastaAnalitico >= desdeAnalitico;
  const inventarioAnalitico = useQuery({
    ...inventarioAnaliticoQuery(empresaId, {
      desde: desdeAnalitico,
      hasta: hastaAnalitico,
      ...(sucursalAnaliticaId ? { sucursalId: sucursalAnaliticaId } : {}),
    }),
    enabled: puedeVer && pestanaActual === "analitico" && rangoAnaliticoValido,
  });
  const mutacionIniciar = useMutation({
    mutationFn: () => iniciarTomaFisica(empresaId, { sucursalId, fecha: fechaToma }),
    onSuccess: (resultado) => {
      queryClient.setQueryData(claveTomaFisica(empresaId, sucursalId), resultado);
      setConteos({});
      setCostos({});
      toast.success(T.conteo.iniciada);
    },
  });
  const lineasConteo = (toma.data?.detalles ?? [])
    .map((detalle) => {
      const local = conteos[detalle.productoId];
      if (detalle.controlaSeries) {
        const series = (local?.series ?? detalle.seriesContadas?.join("\n") ?? "")
          .split(/\r?\n/)
          .map((serie) => serie.trim())
          .filter(Boolean);
        return series.length || local?.series !== undefined || (detalle.cantidadContada ?? "") !== ""
          ? { productoId: detalle.productoId, cantidadContada: String(series.length), seriesContadas: series }
          : null;
      }
      const cantidad = local?.cantidad ?? detalle.cantidadContada ?? "";
      return cantidad === "" ? null : { productoId: detalle.productoId, cantidadContada: cantidad };
    })
    .filter((linea): linea is NonNullable<typeof linea> => linea !== null);
  const mutacionGuardar = useMutation({
    mutationFn: () => {
      const tomaId = toma.data?.id;
      if (!tomaId || lineasConteo.length === 0) throw new Error(T.conteo.faltaConteo);
      return guardarConteoTomaFisica(empresaId, tomaId, { lineas: lineasConteo });
    },
    onSuccess: (resultado) => {
      queryClient.setQueryData(claveTomaFisica(empresaId, sucursalId), resultado);
      setConteos({});
      toast.success(T.conteo.guardada);
    },
  });
  const mutacionAprobar = useMutation({
    mutationFn: () => {
      const tomaId = toma.data?.id;
      if (!tomaId) throw new Error(T.conteo.faltaConteo);
      const costosSobrantes = (toma.data?.detalles ?? [])
        .filter((detalle) => detalle.cantidadSobrante !== null && detalle.cantidadSobrante !== "0.0000")
        .map((detalle) => ({
          productoId: detalle.productoId,
          costoUnitario: costos[detalle.productoId] ?? "",
        }));
      return aprobarTomaFisica(empresaId, tomaId, {
        ...(cuentaFaltantesId ? { cuentaFaltantesId } : {}),
        ...(cuentaSobrantesId ? { cuentaSobrantesId } : {}),
        costosSobrantes,
      });
    },
    onSuccess: (resultado) => {
      queryClient.setQueryData(claveTomaFisica(empresaId, sucursalId), resultado);
      setCostos({});
      toast.success(T.conteo.aprobada);
    },
  });
  const detallesToma = toma.data?.detalles ?? [];
  const faltantesToma = detallesToma.some(
    (detalle) => detalle.cantidadFaltante !== null && detalle.cantidadFaltante !== "0.0000",
  );
  const sobrantesToma = detallesToma.filter(
    (detalle) => detalle.cantidadSobrante !== null && detalle.cantidadSobrante !== "0.0000",
  );
  const conteoCompleto = detallesToma.every((detalle) => detalle.cantidadContada !== null);
  const conteoSinGuardar = Object.keys(conteos).length > 0;
  const costosCompletos = sobrantesToma.every((detalle) => (costos[detalle.productoId] ?? "").trim() !== "");
  const cuentasCompletas =
    (!faltantesToma || Boolean(cuentaFaltantesId)) &&
    (sobrantesToma.length === 0 || Boolean(cuentaSobrantesId));

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />

      {!puedeVer ? (
        <Alert>{T.sinPermiso}</Alert>
      ) : (
        <>
          <div
            role="tablist"
            aria-label={T.pestanas.etiqueta}
            className="flex flex-wrap gap-2 border-b border-border"
          >
            {[
              { id: "conteo", texto: T.pestanas.conteo },
              { id: "series", texto: T.pestanas.series },
              { id: "reabastecimiento", texto: T.pestanas.reabastecimiento },
              { id: "analitico", texto: T.pestanas.analitico },
            ].map((pestana) => (
              <button
                key={pestana.id}
                type="button"
                role="tab"
                aria-selected={pestana.id === pestanaActual}
                aria-controls={pestana.id === pestanaActual ? `panel-${pestana.id}` : undefined}
                onClick={() => setPestanaActual(pestana.id as Pestana)}
                className={cn(
                  "border-b-2 px-3 py-3 text-sm font-medium",
                  pestana.id === pestanaActual
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground opacity-60",
                )}
              >
                {pestana.texto}
              </button>
            ))}
          </div>

          {pestanaActual === "conteo" && (
            <div id="panel-conteo" role="tabpanel" aria-label={T.pestanas.conteo} className="grid gap-4">
              <Card className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr]">
                <Field>
                  <FieldLabel htmlFor="conteo-sucursal">{T.conteo.sucursal}</FieldLabel>
                  <NativeSelect
                    id="conteo-sucursal"
                    className="h-10"
                    value={sucursalId}
                    disabled={!sucursales.isSuccess}
                    onChange={(evento) => {
                      setSucursalElegida(evento.target.value);
                      setConteos({});
                      setCostos({});
                    }}
                  >
                    {activas.map((sucursal) => (
                      <option key={sucursal.id} value={sucursal.id}>
                        {sucursal.nombre}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="conteo-fecha">{T.conteo.fechaLabel}</FieldLabel>
                  <Input
                    id="conteo-fecha"
                    type="date"
                    value={toma.data?.fecha ?? fechaToma}
                    onChange={(evento) => setFechaToma(evento.target.value)}
                    disabled={
                      !puedeContar || sucursalId === "" || (toma.data !== null && toma.data !== undefined)
                    }
                  />
                </Field>
              </Card>

              {sucursales.isSuccess && activas.length === 0 && <Alert>{T.sinSucursales}</Alert>}
              {toma.isFetching && !toma.data && (
                <p role="status" className="text-muted-foreground">
                  {T.conteo.cargando}
                </p>
              )}
              {toma.isError && (
                <Alert variant="error">
                  <p>
                    {T.conteo.error} {mensajeDeError(toma.error)}
                  </p>
                  {!(toma.error instanceof ErrorApi && toma.error.estado === 403) && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => void toma.refetch()}>
                      {T.reintentar}
                    </Button>
                  )}
                </Alert>
              )}
              {mutacionIniciar.isError && (
                <Alert variant="error">{mensajeDeError(mutacionIniciar.error)}</Alert>
              )}
              {mutacionGuardar.isError && (
                <Alert variant="error">{mensajeDeError(mutacionGuardar.error)}</Alert>
              )}
              {mutacionAprobar.isError && (
                <Alert variant="error">{mensajeDeError(mutacionAprobar.error)}</Alert>
              )}

              {toma.isSuccess && !toma.data && (
                <>
                  <p className="text-muted-foreground">{T.conteo.sinToma}</p>
                  {puedeContar && (
                    <Button
                      type="button"
                      className="justify-self-start"
                      disabled={!sucursalId || mutacionIniciar.isPending}
                      onClick={() => mutacionIniciar.mutate()}
                    >
                      {mutacionIniciar.isPending ? T.conteo.iniciando : T.conteo.iniciar}
                    </Button>
                  )}
                </>
              )}

              {toma.data && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold">
                      {T.conteo.titulo(formatearFecha(toma.data.fecha))}
                    </h2>
                    <Badge variant={toma.data.estado === "aprobada" ? "solida" : "discontinua"}>
                      {toma.data.estado === "aprobada" ? T.conteo.aprobadaEstado : T.conteo.enConteo}
                    </Badge>
                  </div>
                  <Card className="p-4">
                    <p className="font-medium">
                      {T.conteo.resumen(
                        toma.data.resumen.productosConDiferencia,
                        formatearDinero(toma.data.resumen.valorFaltante),
                      )}
                    </p>
                    {toma.data.resumen.cantidadSobrante !== "0.0000" && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {T.conteo.unidadesSobrantes(toma.data.resumen.cantidadSobrante)}
                      </p>
                    )}
                  </Card>

                  <Card className="overflow-hidden">
                    <Table aria-label={T.conteo.titulo(formatearFecha(toma.data.fecha))}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{T.conteo.columnas.producto}</TableHead>
                          <TableHead className="text-right">{T.conteo.columnas.sistema}</TableHead>
                          <TableHead>{T.conteo.columnas.contado}</TableHead>
                          <TableHead className="text-right">{T.conteo.columnas.diferencia}</TableHead>
                          <TableHead className="text-right">{T.conteo.columnas.valor}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detallesToma.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                              {T.conteo.sinProductos}
                            </TableCell>
                          </TableRow>
                        )}
                        {detallesToma.map((detalle) => {
                          const local = conteos[detalle.productoId];
                          const series = local?.series ?? detalle.seriesContadas?.join("\n") ?? "";
                          const cantidad = local?.cantidad ?? detalle.cantidadContada ?? "";
                          const soloLectura = toma.data?.estado === "aprobada" || !puedeContar;
                          return (
                            <TableRow key={detalle.productoId}>
                              <TableCell>
                                <span className="block font-medium">{detalle.codigo}</span>
                                <span className="text-sm text-muted-foreground">{detalle.nombre}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {unidades(detalle.existenciaSistema)} {detalle.unidadMedida}
                              </TableCell>
                              <TableCell className="min-w-56">
                                {detalle.controlaSeries ? (
                                  <div className="grid gap-1">
                                    <Input
                                      aria-label={T.conteo.columnas.contado}
                                      type="number"
                                      value={
                                        series
                                          .split(/\r?\n/)
                                          .map((s) => s.trim())
                                          .filter(Boolean).length
                                      }
                                      readOnly
                                      disabled={soloLectura}
                                    />
                                    <textarea
                                      aria-label={T.conteo.seriesLabel(detalle.nombre)}
                                      className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                      placeholder={T.conteo.seriesPlaceholder}
                                      value={series}
                                      disabled={soloLectura}
                                      onChange={(evento) =>
                                        setConteos((actual) => ({
                                          ...actual,
                                          [detalle.productoId]: { cantidad: "", series: evento.target.value },
                                        }))
                                      }
                                    />
                                  </div>
                                ) : (
                                  <Input
                                    aria-label={`${T.conteo.columnas.contado}: ${detalle.nombre}`}
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={cantidad}
                                    disabled={soloLectura}
                                    onChange={(evento) =>
                                      setConteos((actual) => ({
                                        ...actual,
                                        [detalle.productoId]: { cantidad: evento.target.value, series: "" },
                                      }))
                                    }
                                  />
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {detalle.diferencia === null
                                  ? ""
                                  : `${unidades(detalle.diferencia)} ${detalle.unidadMedida}`}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {detalle.cantidadSobrante !== null && detalle.cantidadSobrante !== "0.0000"
                                  ? detalle.valorSobrante === null
                                    ? T.conteo.costoPendiente
                                    : formatearDinero(detalle.valorSobrante)
                                  : formatearDinero(detalle.valorFaltante ?? "0.00")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>

                  {toma.data.estado === "en_conteo" && puedeContar && (
                    <Button
                      type="button"
                      className="justify-self-start"
                      disabled={mutacionGuardar.isPending || lineasConteo.length === 0}
                      onClick={() => mutacionGuardar.mutate()}
                    >
                      {mutacionGuardar.isPending ? T.conteo.guardando : T.conteo.guardar}
                    </Button>
                  )}

                  {toma.data.estado === "en_conteo" && puedeAprobar && (
                    <Card className="grid gap-4 p-4">
                      <h3 className="font-semibold">{T.conteo.aprobacion}</h3>
                      {!conteoCompleto && <Alert>{T.conteo.completarAntesDeAprobar}</Alert>}
                      {faltantesToma && (
                        <Field>
                          <FieldLabel htmlFor="cuenta-faltantes">{T.conteo.cuentaFaltantes}</FieldLabel>
                          <NativeSelect
                            id="cuenta-faltantes"
                            className="h-10"
                            value={cuentaFaltantesId}
                            disabled={!cuentas.isSuccess}
                            onChange={(evento) => setCuentaFaltantesId(evento.target.value)}
                          >
                            <option value="">{T.conteo.elegirCuenta}</option>
                            {cuentasContra.map((cuenta: CuentaCatalogo) => (
                              <option key={cuenta.id} value={cuenta.id}>
                                {cuenta.codigo} · {cuenta.nombre}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                      )}
                      {sobrantesToma.map((detalle) => (
                        <Field key={detalle.productoId}>
                          <FieldLabel htmlFor={`costo-${detalle.productoId}`}>
                            {T.conteo.costoProducto(detalle.codigo, detalle.unidadMedida)}
                          </FieldLabel>
                          <Input
                            id={`costo-${detalle.productoId}`}
                            type="number"
                            min="0"
                            step="0.0001"
                            value={costos[detalle.productoId] ?? ""}
                            onChange={(evento) =>
                              setCostos((actual) => ({
                                ...actual,
                                [detalle.productoId]: evento.target.value,
                              }))
                            }
                          />
                        </Field>
                      ))}
                      {sobrantesToma.length > 0 && (
                        <Field>
                          <FieldLabel htmlFor="cuenta-sobrantes">{T.conteo.cuentaSobrantes}</FieldLabel>
                          <NativeSelect
                            id="cuenta-sobrantes"
                            className="h-10"
                            value={cuentaSobrantesId}
                            disabled={!cuentas.isSuccess}
                            onChange={(evento) => setCuentaSobrantesId(evento.target.value)}
                          >
                            <option value="">{T.conteo.elegirCuenta}</option>
                            {cuentasContra.map((cuenta: CuentaCatalogo) => (
                              <option key={cuenta.id} value={cuenta.id}>
                                {cuenta.codigo} · {cuenta.nombre}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                      )}
                      {cuentas.isError && <Alert variant="error">{mensajeDeError(cuentas.error)}</Alert>}
                      <Button
                        type="button"
                        className="justify-self-start"
                        disabled={
                          !conteoCompleto ||
                          conteoSinGuardar ||
                          !costosCompletos ||
                          !cuentasCompletas ||
                          mutacionAprobar.isPending
                        }
                        onClick={() => mutacionAprobar.mutate()}
                      >
                        {mutacionAprobar.isPending ? T.conteo.aprobando : T.conteo.generarAjuste}
                      </Button>
                    </Card>
                  )}
                  {toma.data.estado === "aprobada" && toma.data.partidaId && (
                    <p className="text-sm text-muted-foreground">
                      {T.conteo.partidaCreada} {toma.data.partidaId}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {pestanaActual === "series" && (
            <div id="panel-series" role="tabpanel" aria-label={T.pestanas.series} className="grid gap-4">
              <Card className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr]">
                <Field>
                  <FieldLabel htmlFor="series-producto">{T.producto}</FieldLabel>
                  <NativeSelect
                    id="series-producto"
                    className="h-10"
                    value={productoId}
                    disabled={!productos.isSuccess}
                    onChange={(evento) => setProductoId(evento.target.value)}
                  >
                    <option value="">{T.elegirProducto}</option>
                    {productosControlados.map((producto) => (
                      <option key={producto.id} value={producto.id}>
                        {`${producto.codigo} · ${producto.nombre}`}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="series-sucursal">{T.sucursal}</FieldLabel>
                  <NativeSelect
                    id="series-sucursal"
                    className="h-10"
                    value={sucursalId}
                    disabled={!sucursales.isSuccess}
                    onChange={(evento) => setSucursalElegida(evento.target.value)}
                  >
                    {activas.map((sucursal) => (
                      <option key={sucursal.id} value={sucursal.id}>
                        {sucursal.nombre}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="series-estado">{T.estado}</FieldLabel>
                  <NativeSelect
                    id="series-estado"
                    className="h-10"
                    value={estado}
                    onChange={(evento) => setEstado(evento.target.value as ConsultaSeries["estado"])}
                  >
                    <option value="todas">{T.todos}</option>
                    <option value="en_existencia">{T.enExistencia}</option>
                    <option value="vendidas">{T.vendidas}</option>
                  </NativeSelect>
                </Field>
              </Card>

              {productos.isError && (
                <Alert variant="error">
                  <p>{mensajeDeError(productos.error)}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void productos.refetch()}
                  >
                    {T.reintentar}
                  </Button>
                </Alert>
              )}
              {sucursales.isSuccess && activas.length === 0 && <Alert>{T.sinSucursales}</Alert>}
              {productos.isSuccess && productosControlados.length === 0 && <Alert>{T.sinProductos}</Alert>}
              {!productoId && productosControlados.length > 0 && (
                <p className="p-8 text-center">{T.elegir}</p>
              )}
              {productoId && series.isFetching && !series.data && (
                <p role="status" className="text-muted-foreground">
                  {T.cargando}
                </p>
              )}
              {productoId && series.isError && (
                <Alert variant="error">
                  <p>
                    {T.error} {mensajeDeError(series.error)}
                  </p>
                  {!(series.error instanceof ErrorApi && series.error.estado === 403) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => void series.refetch()}
                    >
                      {T.reintentar}
                    </Button>
                  )}
                </Alert>
              )}
              {productoId && series.isSuccess && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="solida">
                      {T.resumen.existencia(
                        series.data.filter((serie) => serie.estado === "en_existencia").length,
                      )}
                    </Badge>
                    <Badge variant="neutra">
                      {T.resumen.vendidas(series.data.filter((serie) => serie.estado === "vendida").length)}
                    </Badge>
                  </div>
                  <Card className="overflow-hidden">
                    <Table aria-label={T.pestanas.series}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{T.columnas.numero}</TableHead>
                          <TableHead className="text-right">{T.columnas.costo}</TableHead>
                          <TableHead>{T.columnas.estado}</TableHead>
                          <TableHead>{T.columnas.entrada}</TableHead>
                          <TableHead>{T.columnas.salida}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {series.data.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                              {estado === "todas" ? T.vacio : T.sinResultados}
                            </TableCell>
                          </TableRow>
                        )}
                        {series.data.map((serie) => (
                          <TableRow key={serie.id}>
                            <TableCell className="font-medium tabular-nums">{serie.numeroSerie}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatearDinero(serie.costoUnitario)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={serie.estado === "en_existencia" ? "solida" : "neutra"}>
                                {serie.estado === "en_existencia" ? T.disponible : T.vendida}
                              </Badge>
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatearFecha(serie.fechaEntrada)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {serie.fechaSalida ? formatearFecha(serie.fechaSalida) : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </>
              )}
            </div>
          )}

          {pestanaActual === "reabastecimiento" && (
            <div
              id="panel-reabastecimiento"
              role="tabpanel"
              aria-label={T.pestanas.reabastecimiento}
              className="grid gap-4"
            >
              <Card className="grid gap-3 p-4 sm:max-w-sm">
                <Field>
                  <FieldLabel htmlFor="reab-sucursal">{T.reabastecer.sucursal}</FieldLabel>
                  <NativeSelect
                    id="reab-sucursal"
                    className="h-10"
                    value={sucursalId}
                    disabled={!sucursales.isSuccess}
                    onChange={(evento) => setSucursalElegida(evento.target.value)}
                  >
                    {activas.map((sucursal) => (
                      <option key={sucursal.id} value={sucursal.id}>
                        {sucursal.nombre}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </Card>

              {sucursales.isSuccess && activas.length === 0 && <Alert>{T.sinSucursales}</Alert>}
              {sucursalId && reabastecimiento.isFetching && !reabastecimiento.data && (
                <p role="status" className="text-muted-foreground">
                  {T.reabastecer.cargando}
                </p>
              )}
              {reabastecimiento.isError && (
                <Alert variant="error">
                  <p>
                    {T.reabastecer.error} {mensajeDeError(reabastecimiento.error)}
                  </p>
                  {!(reabastecimiento.error instanceof ErrorApi && reabastecimiento.error.estado === 403) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => void reabastecimiento.refetch()}
                    >
                      {T.reintentar}
                    </Button>
                  )}
                </Alert>
              )}
              {reabastecimiento.isSuccess && (
                <>
                  <Badge variant={reabastecimiento.data.length ? "solida" : "neutra"}>
                    {T.reabastecer.resumen(reabastecimiento.data.length)}
                  </Badge>
                  <Card className="overflow-hidden">
                    <Table aria-label={T.reabastecer.titulo}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{T.reabastecer.columnas.producto}</TableHead>
                          <TableHead className="text-right">{T.reabastecer.columnas.existencia}</TableHead>
                          <TableHead className="text-right">{T.reabastecer.columnas.minimo}</TableHead>
                          <TableHead className="text-right">{T.reabastecer.columnas.faltante}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reabastecimiento.data.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                              {T.reabastecer.vacio}
                            </TableCell>
                          </TableRow>
                        )}
                        {reabastecimiento.data.map((producto) => (
                          <TableRow key={producto.productoId}>
                            <TableCell>
                              <span className="block font-medium">{producto.codigo}</span>
                              <span className="text-sm text-muted-foreground">{producto.nombre}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {unidades(producto.existenciaActual)} {producto.unidadMedida}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {unidades(producto.existenciaMinima)} {producto.unidadMedida}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {unidades(producto.cantidadFaltante)} {producto.unidadMedida}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </>
              )}
            </div>
          )}
          {pestanaActual === "analitico" && (
            <div
              id="panel-analitico"
              role="tabpanel"
              aria-label={T.pestanas.analitico}
              className="grid gap-4"
            >
              <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_2fr]">
                <Field>
                  <FieldLabel htmlFor="analitico-desde">{T.analitico.desde}</FieldLabel>
                  <Input
                    id="analitico-desde"
                    type="date"
                    value={desdeAnalitico}
                    onChange={(evento) => setDesdeAnalitico(evento.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="analitico-hasta">{T.analitico.hasta}</FieldLabel>
                  <Input
                    id="analitico-hasta"
                    type="date"
                    value={hastaAnalitico}
                    onChange={(evento) => setHastaAnalitico(evento.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="analitico-sucursal">{T.analitico.sucursal}</FieldLabel>
                  <NativeSelect
                    id="analitico-sucursal"
                    className="h-10"
                    value={sucursalAnaliticaId}
                    disabled={!sucursales.isSuccess}
                    onChange={(evento) => setSucursalAnaliticaId(evento.target.value)}
                  >
                    <option value="">{T.analitico.todas}</option>
                    {activas.map((sucursal) => (
                      <option key={sucursal.id} value={sucursal.id}>
                        {sucursal.nombre}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </Card>

              {!rangoAnaliticoValido && <Alert variant="error">{T.analitico.rangoInvalido}</Alert>}
              {sucursales.isSuccess && activas.length === 0 && <Alert>{T.sinSucursales}</Alert>}
              {inventarioAnalitico.isFetching && !inventarioAnalitico.data && (
                <p role="status" className="text-muted-foreground">
                  {T.analitico.cargando}
                </p>
              )}
              {inventarioAnalitico.isError && (
                <Alert variant="error">
                  <p>
                    {T.analitico.error} {mensajeDeError(inventarioAnalitico.error)}
                  </p>
                  {!(
                    inventarioAnalitico.error instanceof ErrorApi && inventarioAnalitico.error.estado === 403
                  ) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => void inventarioAnalitico.refetch()}
                    >
                      {T.reintentar}
                    </Button>
                  )}
                </Alert>
              )}
              {inventarioAnalitico.isSuccess && (
                <>
                  <h2 className="text-lg font-semibold">{T.analitico.titulo}</h2>
                  <p className="text-sm text-muted-foreground">{T.analitico.descripcion}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      {
                        etiqueta: T.analitico.inventarioInicial,
                        valor: inventarioAnalitico.data.inventarioInicial,
                      },
                      { etiqueta: T.analitico.compras, valor: inventarioAnalitico.data.compras },
                      {
                        etiqueta: T.analitico.gastosSobreCompras,
                        valor: inventarioAnalitico.data.gastosSobreCompras,
                      },
                      {
                        etiqueta: T.analitico.devolucionesYRebajas,
                        valor: inventarioAnalitico.data.devolucionesYRebajas,
                      },
                      { etiqueta: T.analitico.comprasNetas, valor: inventarioAnalitico.data.comprasNetas },
                      {
                        etiqueta: T.analitico.inventarioFinal,
                        valor: inventarioAnalitico.data.inventarioFinal,
                      },
                      { etiqueta: T.analitico.costoVentas, valor: inventarioAnalitico.data.costoVentas },
                    ].map((rubro) => (
                      <Card key={rubro.etiqueta} className="p-4">
                        <p className="text-sm text-muted-foreground">{rubro.etiqueta}</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {rubro.valor === null ? T.analitico.costoPendiente : formatearDinero(rubro.valor)}
                        </p>
                      </Card>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">{T.analitico.formula}</p>
                  {inventarioAnalitico.data.inventarioFinal === null && (
                    <Alert>{T.analitico.costoPendiente}</Alert>
                  )}
                  <Card className="overflow-hidden">
                    <Table aria-label={T.analitico.titulo}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{T.analitico.sucursalTabla}</TableHead>
                          <TableHead>{T.analitico.fechaToma}</TableHead>
                          <TableHead className="text-right">{T.analitico.inventarioFinal}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventarioAnalitico.data.inventarioFinalPorSucursal.map((fila) => (
                          <TableRow key={fila.sucursalId}>
                            <TableCell>{fila.sucursal}</TableCell>
                            <TableCell>
                              {fila.fechaToma ? formatearFecha(fila.fechaToma) : T.analitico.tomaPendiente}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fila.valor === null ? T.analitico.pendiente : formatearDinero(fila.valor)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Pagina>
  );
}
