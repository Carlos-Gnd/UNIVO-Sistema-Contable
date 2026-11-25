import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, LoaderCircle, Plus, Scale } from "lucide-react";
import {
  crearConfiguracionIsrSchema,
  Dinero,
  type CrearConfiguracionIsr,
  type DetalleIsrAnual,
  type LineaPartidaAnualVista,
} from "@contable/shared";
import { useQuery } from "@tanstack/react-query";
import type { Parametros } from "@/app/rutas";
import { Campo } from "@/components/campo";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { mensajeDeError } from "@/lib/api";
import { validarFormulario } from "@/lib/validacion";
import { usePermiso } from "@/modules/organizacion/permisos";
import {
  cierreAnualQuery,
  useCalcularIsr,
  useCerrarNoviembre,
  useConfigurarIsr,
  useConfirmarCierre,
  useCrearPartidaCierre,
  useCrearPartidaReapertura,
} from "./cierre-anual-api";
import { TEXTOS_CIERRE_ANUAL as T } from "./textos";

interface TramoFormulario {
  hasta: string | null;
  porcentaje: string;
  cuotaFija: string;
}

const simboloMonto = (monto: string) => formatearDinero(monto);

function IndicadorValidacion({ ok }: { ok: boolean }) {
  return ok ? (
    <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
  ) : (
    <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
  );
}

function FilaDetalle({ etiqueta, monto }: { etiqueta: string; monto: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="text-right text-sm font-semibold tabular-nums">{simboloMonto(monto)}</dd>
    </div>
  );
}

function TarjetaDetalle({ detalle, tipoSociedad }: { detalle: DetalleIsrAnual; tipoSociedad: boolean }) {
  const tramo = detalle.tramoAplicado;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Scale aria-hidden="true" className="size-5 text-muted-foreground" />
        <h3 className="font-semibold">{T.isr.detalle}</h3>
      </div>
      <dl className="divide-y-0">
        <FilaDetalle etiqueta={T.isr.utilidadAntes} monto={detalle.utilidadAntesImpuesto} />
        <FilaDetalle etiqueta={T.isr.base} monto={detalle.baseImponible} />
        {!tipoSociedad && tramo && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
            <dt className="text-sm text-muted-foreground">{T.isr.tramoAplicado}</dt>
            <dd className="text-right text-sm font-semibold tabular-nums">
              {simboloMonto(tramo.desde)} a {tramo.hasta === null ? "sin límite" : simboloMonto(tramo.hasta)}
            </dd>
          </div>
        )}
        {detalle.tasaAplicada !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
            <dt className="text-sm text-muted-foreground">{T.isr.tasaAplicada}</dt>
            <dd className="text-right text-sm font-semibold tabular-nums">{detalle.tasaAplicada}%</dd>
          </div>
        )}
        <FilaDetalle etiqueta={T.isr.impuesto} monto={detalle.impuestoDeterminado} />
        <FilaDetalle etiqueta={T.isr.pagos} monto={detalle.pagosACuenta} />
        <FilaDetalle etiqueta={T.isr.pagosAplicados} monto={detalle.pagosAplicados} />
        <FilaDetalle etiqueta={T.isr.pendiente} monto={detalle.impuestoPendiente} />
        <FilaDetalle etiqueta={T.isr.favor} monto={detalle.saldoAFavor} />
        <FilaDetalle etiqueta={T.isr.utilidadDespues} monto={detalle.utilidadDespuesDeImpuesto} />
        {tipoSociedad && (
          <>
            <FilaDetalle etiqueta={T.isr.capital} monto={detalle.capitalSocial} />
            <FilaDetalle etiqueta={T.isr.reservaActual} monto={detalle.reservaLegalActual} />
            <FilaDetalle etiqueta={T.isr.limiteReserva} monto={detalle.limiteReservaLegal} />
            <FilaDetalle etiqueta={T.isr.reservaDisponible} monto={detalle.reservaLegalDisponible} />
            <FilaDetalle etiqueta={T.isr.reservaProvision} monto={detalle.reservaLegalAProvisionar} />
          </>
        )}
      </dl>
    </Card>
  );
}

function TablaPartidaAnual({ lineas }: { lineas: readonly LineaPartidaAnualVista[] }) {
  if (lineas.length === 0) return <p className="text-sm text-muted-foreground">{T.tabla.sinLineas}</p>;
  const totalDebe = Dinero.sumar(lineas.map((linea) => linea.debe)).aTexto();
  const totalHaber = Dinero.sumar(lineas.map((linea) => linea.haber)).aTexto();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">{T.tabla.titulo}</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              {T.tabla.cuenta}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {T.tabla.debe}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {T.tabla.haber}
            </th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((linea, indice) => (
            <tr key={`${linea.codigo}-${indice}`} className="border-t border-border">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="mr-2 font-mono text-muted-foreground">{linea.codigo}</span>
                {linea.nombre}
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{formatearDinero(linea.debe)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatearDinero(linea.haber)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-muted/50 font-semibold">
          <tr>
            <th scope="row" className="px-3 py-2 text-left">
              Total
            </th>
            <td className="px-3 py-2 text-right tabular-nums">{formatearDinero(totalDebe)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatearDinero(totalHaber)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PasoIndicador({
  numero,
  etiqueta,
  activo,
  completado,
  deshabilitado,
  onElegir,
}: {
  numero: number;
  etiqueta: string;
  activo: boolean;
  completado: boolean;
  deshabilitado: boolean;
  onElegir: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${numero}. ${etiqueta}`}
      aria-current={activo ? "step" : undefined}
      disabled={deshabilitado}
      onClick={onElegir}
      className={`flex min-w-0 flex-1 items-center gap-2 border-b-2 px-2 py-3 text-left text-sm transition-colors sm:px-3 ${
        activo
          ? "border-foreground font-semibold text-foreground"
          : completado
            ? "border-emerald-600 text-foreground"
            : "border-transparent text-muted-foreground"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs ${
          completado ? "border-emerald-600 bg-emerald-600 text-white" : "border-current"
        }`}
      >
        {completado ? <CircleCheck aria-hidden="true" className="size-4" /> : numero}
      </span>
      <span className="hidden truncate sm:inline">{etiqueta}</span>
      <span className="sr-only sm:hidden">{etiqueta}</span>
    </button>
  );
}

/** Asistente anual de cinco pasos; HU-34 habilita validaciones e ISR (S3-T08). */
export function PantallaCierreAnual({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const anio = new Date().getFullYear();
  const consulta = useQuery(cierreAnualQuery(empresaId, anio));
  const cerrarNoviembre = useCerrarNoviembre(empresaId, anio);
  const configurar = useConfigurarIsr(empresaId, anio);
  const calcular = useCalcularIsr(empresaId, anio);
  const crearCierre = useCrearPartidaCierre(empresaId, anio);
  const confirmarCierre = useConfirmarCierre(empresaId, anio);
  const crearReapertura = useCrearPartidaReapertura(empresaId, anio);
  const puedeCerrar = usePermiso("periodos.cerrar");
  const puedeReabrir = usePermiso("partidas.registrar");
  const puedeGenerar = usePermiso("declaraciones.generar");
  const [paso, setPaso] = useState(1);
  const [provisionCalculada, setProvisionCalculada] = useState(false);
  const [tasaSociedad, setTasaSociedad] = useState("");
  const [tramos, setTramos] = useState<TramoFormulario[]>([{ hasta: null, porcentaje: "", cuotaFija: "" }]);
  const [editandoConfiguracion, setEditandoConfiguracion] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState<string>();

  const estado = consulta.data;
  const periodos = estado?.periodos ?? [];
  const mesesPreviosCerrados = periodos.filter(
    (periodo) => periodo.mes <= 10 && periodo.estado === "cerrado",
  ).length;
  const mesNoviembre = periodos.find((periodo) => periodo.mes === 11);
  const diciembre = periodos.find((periodo) => periodo.mes === 12);
  const puedeCompletarPasoUno = Boolean(
    estado &&
    mesesPreviosCerrados === 10 &&
    mesNoviembre?.estado === "abierto" &&
    diciembre?.estado === "abierto" &&
    estado.validaciones.sinBorradores.ok &&
    estado.validaciones.partidasCuadradas.ok &&
    estado.validaciones.balanza.ok,
  );
  const isrSociedad = estado?.tipoContribuyente === "sociedad";
  const allChecksPass = Boolean(
    estado &&
    estado.validaciones.sinBorradores.ok &&
    estado.validaciones.periodosListos.ok &&
    estado.validaciones.partidasCuadradas.ok &&
    estado.validaciones.balanza.ok,
  );
  const sinImpuesto = Boolean(
    estado?.detalleIsr && Dinero.de(estado.detalleIsr.impuestoDeterminado).esCero(),
  );
  const calculoListo = provisionCalculada || Boolean(estado?.partidaIsr) || sinImpuesto;
  const puedeCrearPartidaCierre = Boolean(
    estado?.permisoCerrar &&
    puedeCerrar &&
    estado.vistaCierre &&
    !estado.partidaCierre &&
    !estado.ejercicioCerrado,
  );
  const puedeConfirmarEjercicio = Boolean(
    estado?.permisoCerrar &&
    puedeCerrar &&
    estado.partidaCierre?.estado === "contabilizada" &&
    estado.validaciones.sinBorradores.ok &&
    !estado.ejercicioCerrado,
  );
  const puedeCrearPartidaReapertura = Boolean(
    estado?.permisoReabrir &&
    puedeReabrir &&
    estado.ejercicioCerrado &&
    estado.vistaReapertura &&
    !estado.partidaReapertura,
  );
  const isrCompleto = sinImpuesto || estado?.partidaIsr?.estado === "contabilizada";
  const cierreCompleto = estado?.ejercicioCerrado && estado.partidaCierre?.estado === "contabilizada";
  const reaperturaCompleta = Boolean(estado?.partidaReapertura);

  function agregarTramo() {
    setTramos((actuales) => {
      if (
        actuales.length >= 20 ||
        actuales.some((tramo, indice) => indice < actuales.length - 1 && !tramo.hasta)
      ) {
        return actuales;
      }
      const siguientes = actuales.map((tramo, indice) =>
        indice === actuales.length - 1 ? { ...tramo, hasta: "" } : tramo,
      );
      return [...siguientes, { hasta: null, porcentaje: "", cuotaFija: "" }];
    });
    setErrorFormulario(undefined);
  }

  function quitarUltimoTramo() {
    setTramos((actuales) => {
      if (actuales.length < 2) return actuales;
      return [...actuales.slice(0, -2), { ...actuales[actuales.length - 2]!, hasta: null }];
    });
    setErrorFormulario(undefined);
  }

  function iniciarEdicionConfiguracion() {
    if (estado?.configuracionIsr?.tipoContribuyente === "persona_natural") {
      setTramos(
        estado.configuracionIsr.tramos.map((tramo) => ({
          hasta: tramo.hasta,
          porcentaje: tramo.porcentaje,
          cuotaFija: tramo.cuotaFija,
        })),
      );
    }
    if (estado?.configuracionIsr?.tipoContribuyente === "sociedad") {
      setTasaSociedad(estado.configuracionIsr.tasaSociedad ?? "");
    }
    setErrorFormulario(undefined);
    setEditandoConfiguracion(true);
  }

  function enviarConfiguracion(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!estado || !puedeGenerar || configurar.isPending) return;
    const datos: CrearConfiguracionIsr = isrSociedad
      ? { anio, tipoContribuyente: "sociedad", tasaSociedad }
      : {
          anio,
          tipoContribuyente: "persona_natural",
          tramos: tramos.map((tramo, indice) => ({
            desde: indice === 0 ? "0.00" : (tramos[indice - 1]?.hasta ?? ""),
            hasta: indice === tramos.length - 1 ? null : tramo.hasta,
            porcentaje: tramo.porcentaje,
            cuotaFija: tramo.cuotaFija,
          })),
        };
    const validacion = validarFormulario(
      // La API valida el mismo esquema compartido antes de crear una versión inmutable.
      // Se importa con el tipo del módulo para mantener alineados los datos de la pantalla.
      crearConfiguracionIsrSchema,
      datos,
    );
    if (!validacion.ok) {
      const primerError = Object.values(validacion.errores)
        .flat()
        .find((mensaje): mensaje is string => Boolean(mensaje));
      setErrorFormulario(primerError ?? T.errorValidacion);
      return;
    }
    setErrorFormulario(undefined);
    configurar.mutate(validacion.datos, {
      onSuccess: () => {
        setErrorFormulario(undefined);
        setEditandoConfiguracion(false);
      },
      onError: (error) => setErrorFormulario(mensajeDeError(error)),
    });
  }

  function generarProvisión() {
    if (
      !estado?.permisoGenerar ||
      !puedeGenerar ||
      !estado.configuracionIsr ||
      !allChecksPass ||
      calcular.isPending
    ) {
      return;
    }
    calcular.mutate(undefined, {
      onSuccess: () => setProvisionCalculada(true),
      onError: (error) => setErrorFormulario(mensajeDeError(error)),
    });
  }

  const pasosCompletados = [
    Boolean(allChecksPass || estado?.ejercicioCerrado),
    Boolean(isrCompleto),
    Boolean(cierreCompleto),
    Boolean(reaperturaCompleta),
    Boolean(cierreCompleto && reaperturaCompleta),
  ];
  const puedeEntrarAlPaso = (numero: number) =>
    numero === 1 ||
    (numero === 2 && Boolean(allChecksPass || estado?.ejercicioCerrado)) ||
    (numero === 3 && Boolean(calculoListo || estado?.partidaCierre)) ||
    (numero === 4 && Boolean(estado?.ejercicioCerrado)) ||
    (numero === 5 && reaperturaCompleta);

  return (
    <Pagina>
      <EncabezadoPagina titulo={T.titulo(anio)} descripcion={T.descripcion} />

      {!empresaId && <Alert variant="error">{T.sinEmpresa}</Alert>}
      {consulta.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {consulta.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {estado && (
        <>
          <nav aria-label="Pasos del cierre anual" className="overflow-x-auto border-b border-border">
            <div className="flex min-w-[540px]">
              {T.pasos.map((etiqueta, indice) => {
                const numero = indice + 1;
                const activo = paso === numero;
                return (
                  <PasoIndicador
                    key={etiqueta}
                    numero={numero}
                    etiqueta={etiqueta}
                    activo={activo}
                    completado={pasosCompletados[indice] ?? false}
                    deshabilitado={!puedeEntrarAlPaso(numero)}
                    onElegir={() => setPaso(numero)}
                  />
                );
              })}
            </div>
          </nav>

          {paso === 1 && (
            <section aria-labelledby="titulo-validaciones" className="grid gap-4">
              <Card className="p-5">
                <h2 id="titulo-validaciones" className="mb-4 text-lg font-semibold">
                  {T.validaciones.titulo}
                </h2>
                <ul className="grid gap-4">
                  <li className="flex gap-3">
                    <IndicadorValidacion ok={estado.validaciones.sinBorradores.ok} />
                    <div>
                      <h3 className="font-medium">
                        {estado.validaciones.sinBorradores.ok
                          ? T.validaciones.sinBorradores
                          : T.validaciones.borradores(estado.validaciones.sinBorradores.cantidad)}
                      </h3>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <IndicadorValidacion ok={estado.validaciones.periodosListos.ok} />
                    <div>
                      <h3 className="font-medium">{T.validaciones.periodos}</h3>
                      <p className="text-sm text-muted-foreground">
                        {estado.validaciones.periodosListos.ok
                          ? T.validaciones.periodosListos
                          : T.validaciones.periodosPendientes(mesesPreviosCerrados)}
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <IndicadorValidacion ok={estado.validaciones.partidasCuadradas.ok} />
                    <div>
                      <h3 className="font-medium">
                        {estado.validaciones.partidasCuadradas.ok
                          ? T.validaciones.partidas
                          : T.validaciones.partidasPendientes(estado.validaciones.partidasCuadradas.cantidad)}
                      </h3>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <IndicadorValidacion ok={estado.validaciones.balanza.ok} />
                    <div>
                      <h3 className="font-medium">
                        {estado.validaciones.balanza.ok
                          ? T.validaciones.balanza
                          : T.validaciones.balanzaPendiente}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {T.validaciones.saldo(
                          simboloMonto(estado.validaciones.balanza.debe),
                          simboloMonto(estado.validaciones.balanza.haber),
                          simboloMonto(estado.validaciones.balanza.diferencia),
                        )}
                      </p>
                    </div>
                  </li>
                </ul>
              </Card>

              {!estado.todasSucursales && <Alert>{T.sinTodasSucursales}</Alert>}
              <Alert>{T.validaciones.nota}</Alert>

              {puedeCompletarPasoUno && puedeCerrar && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    onClick={() => cerrarNoviembre.mutate(undefined)}
                    disabled={cerrarNoviembre.isPending}
                  >
                    {cerrarNoviembre.isPending && (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    )}
                    {cerrarNoviembre.isPending ? T.validaciones.cerrando : T.validaciones.accion}
                  </Button>
                </div>
              )}
              {cerrarNoviembre.isError && (
                <Alert variant="error">{mensajeDeError(cerrarNoviembre.error)}</Alert>
              )}
              {!allChecksPass && !puedeCompletarPasoUno && (
                <p className="text-sm text-muted-foreground">{T.validaciones.faltaNov}</p>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setPaso(2)} disabled={!estado.listoParaIsr}>
                  {T.continuar}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </section>
          )}

          {paso === 2 && (
            <section aria-labelledby="titulo-isr" className="grid gap-4">
              <Card className="p-5">
                <div className="mb-4">
                  <h2 id="titulo-isr" className="text-lg font-semibold">
                    {T.isr.titulo}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{T.isr.ayuda}</p>
                </div>
                <p className="mb-4 text-sm font-medium">
                  {isrSociedad ? T.isr.sociedad : T.isr.personaNatural}
                </p>

                {(!estado.configuracionIsr || editandoConfiguracion) && (
                  <>
                    {!estado.todasSucursales && <Alert>{T.sinTodasSucursales}</Alert>}
                    {!puedeGenerar || !estado.permisoGenerar ? (
                      <Alert>{T.isr.sinPermiso}</Alert>
                    ) : (
                      <form noValidate onSubmit={enviarConfiguracion} className="grid gap-4">
                        {isrSociedad ? (
                          <Campo
                            id="isr-tasa-sociedad"
                            etiqueta={T.isr.tasa}
                            ayuda={T.isr.tasaAyuda}
                            error={errorFormulario}
                          >
                            {(props) => (
                              <Input
                                {...props}
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={tasaSociedad}
                                onChange={(evento) => {
                                  setTasaSociedad(evento.target.value);
                                  setErrorFormulario(undefined);
                                }}
                              />
                            )}
                          </Campo>
                        ) : (
                          <div className="grid gap-3">
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-xs font-semibold text-muted-foreground">
                              <span>{T.isr.desde}</span>
                              <span>{T.isr.hasta}</span>
                              <span>{T.isr.porcentaje}</span>
                              <span>{T.isr.cuotaFija}</span>
                            </div>
                            {tramos.map((tramo, indice) => {
                              const desde = indice === 0 ? "0.00" : (tramos[indice - 1]?.hasta ?? "");
                              return (
                                <div
                                  key={indice}
                                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2"
                                >
                                  <div className="grid h-9 items-center rounded-lg bg-secondary px-2 text-sm tabular-nums">
                                    {indice === 0 ? T.isr.desdeCero : T.isr.desdeAnterior(desde)}
                                  </div>
                                  <Input
                                    aria-label={`${T.isr.hasta}, ${T.isr.tramo(indice + 1)}`}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={indice === tramos.length - 1 ? "Sin límite" : undefined}
                                    value={tramo.hasta ?? ""}
                                    onChange={(evento) => {
                                      const valor = evento.target.value;
                                      setTramos((actuales) =>
                                        actuales.map((item, posicion) =>
                                          posicion === indice
                                            ? {
                                                ...item,
                                                hasta:
                                                  valor || (posicion === actuales.length - 1 ? null : ""),
                                              }
                                            : item,
                                        ),
                                      );
                                      setErrorFormulario(undefined);
                                    }}
                                  />
                                  <Input
                                    aria-label={`${T.isr.porcentaje}, ${T.isr.tramo(indice + 1)}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={tramo.porcentaje}
                                    onChange={(evento) => {
                                      const valor = evento.target.value;
                                      setTramos((actuales) =>
                                        actuales.map((item, posicion) =>
                                          posicion === indice ? { ...item, porcentaje: valor } : item,
                                        ),
                                      );
                                      setErrorFormulario(undefined);
                                    }}
                                  />
                                  <Input
                                    aria-label={`${T.isr.cuotaFija}, ${T.isr.tramo(indice + 1)}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={tramo.cuotaFija}
                                    onChange={(evento) => {
                                      const valor = evento.target.value;
                                      setTramos((actuales) =>
                                        actuales.map((item, posicion) =>
                                          posicion === indice ? { ...item, cuotaFija: valor } : item,
                                        ),
                                      );
                                      setErrorFormulario(undefined);
                                    }}
                                  />
                                </div>
                              );
                            })}
                            <p className="text-xs text-muted-foreground">{T.isr.limiteAyuda}</p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={agregarTramo}
                                disabled={tramos.length >= 20}
                              >
                                <Plus aria-hidden="true" />
                                {T.isr.agregarTramo}
                              </Button>
                              {tramos.length > 1 && (
                                <Button type="button" variant="ghost" onClick={quitarUltimoTramo}>
                                  {T.isr.quitarTramo}
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                        {errorFormulario && !isrSociedad && <Alert variant="error">{errorFormulario}</Alert>}
                        {configurar.isError && (
                          <Alert variant="error">{mensajeDeError(configurar.error)}</Alert>
                        )}
                        <Button type="submit" disabled={configurar.isPending || !allChecksPass}>
                          {configurar.isPending && (
                            <LoaderCircle aria-hidden="true" className="animate-spin" />
                          )}
                          {configurar.isPending ? T.isr.guardando : T.isr.guardar}
                        </Button>
                        {estado.configuracionIsr && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditandoConfiguracion(false)}
                          >
                            {T.isr.cancelarEdicion}
                          </Button>
                        )}
                      </form>
                    )}
                  </>
                )}

                {estado.configuracionIsr && (
                  <div className="grid gap-4">
                    <div>
                      <Badge variant="neutra">{T.isr.configurada(estado.configuracionIsr.version)}</Badge>
                      {isrSociedad ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {T.isr.tasa}: {estado.configuracionIsr.tasaSociedad}%
                        </p>
                      ) : (
                        <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
                          {estado.configuracionIsr.tramos.map((tramo, indice) => (
                            <li key={`${tramo.desde}-${tramo.hasta ?? "abierto"}`}>
                              {T.isr.tramo(indice + 1)}: {simboloMonto(tramo.desde)} a{" "}
                              {tramo.hasta === null ? "sin límite" : simboloMonto(tramo.hasta)},{" "}
                              {tramo.porcentaje}%
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {!editandoConfiguracion && !estado.partidaIsr && puedeGenerar && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={iniciarEdicionConfiguracion}
                        disabled={!allChecksPass || !estado.permisoGenerar}
                      >
                        {T.isr.editar}
                      </Button>
                    )}
                    {estado.detalleIsr && (
                      <TarjetaDetalle detalle={estado.detalleIsr} tipoSociedad={Boolean(isrSociedad)} />
                    )}
                    {estado.partidaIsr ? (
                      <Alert>
                        {T.isr.partida(formatearFecha(estado.partidaIsr.fecha), estado.partidaIsr.estado)}
                      </Alert>
                    ) : estado.detalleIsr && Dinero.de(estado.detalleIsr.impuestoDeterminado).esCero() ? (
                      <Alert>{T.isr.partidaSinImpuesto}</Alert>
                    ) : null}
                    {!estado.todasSucursales && <Alert>{T.sinTodasSucursales}</Alert>}
                    {(!puedeGenerar || !estado.permisoGenerar) && <Alert>{T.isr.sinPermiso}</Alert>}
                    {errorFormulario && <Alert variant="error">{errorFormulario}</Alert>}
                    {calcular.isError && <Alert variant="error">{mensajeDeError(calcular.error)}</Alert>}
                    <Button
                      onClick={generarProvisión}
                      disabled={
                        !estado.todasSucursales ||
                        !estado.permisoGenerar ||
                        !puedeGenerar ||
                        !allChecksPass ||
                        calcular.isPending ||
                        Boolean(estado.partidaIsr)
                      }
                    >
                      {calcular.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                      {calcular.isPending ? T.isr.calculando : T.isr.calcular}
                    </Button>
                    {calcular.isSuccess && calcular.data.partida && <Alert>{T.isr.generada}</Alert>}
                    {calculoListo && (
                      <div className="flex justify-end">
                        <Button variant="outline" onClick={() => setPaso(3)}>
                          {T.isr.continuar}
                          <ArrowRight aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </section>
          )}

          {paso === 3 && (
            <section aria-labelledby="titulo-partida-cierre" className="grid gap-4">
              <Card className="grid gap-4 p-5">
                <div>
                  <h2 id="titulo-partida-cierre" className="text-lg font-semibold">
                    {T.pasos[2]}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{T.cierre.ayuda}</p>
                </div>
                {estado.vistaCierre && (
                  <>
                    <p className="text-sm">
                      <span className="font-medium">{T.cierre.utilidadNeta}:</span>{" "}
                      {formatearDinero(estado.vistaCierre.utilidadNeta)}
                    </p>
                    <TablaPartidaAnual lineas={estado.partidaCierre?.lineas ?? estado.vistaCierre.lineas} />
                  </>
                )}
                {!estado.vistaCierre && !estado.partidaCierre && <Alert>{T.cierre.pendienteIsr}</Alert>}
                {estado.partidaCierre && (
                  <Alert>
                    {T.cierre.partida(
                      formatearFecha(estado.partidaCierre.fecha),
                      estado.partidaCierre.estado,
                    )}
                  </Alert>
                )}
                {estado.ejercicioCerrado && <Alert>{T.cierre.confirmada}</Alert>}
                {crearCierre.isError && <Alert variant="error">{mensajeDeError(crearCierre.error)}</Alert>}
                {confirmarCierre.isError && (
                  <Alert variant="error">{mensajeDeError(confirmarCierre.error)}</Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  {puedeCrearPartidaCierre && (
                    <Button onClick={() => crearCierre.mutate()} disabled={crearCierre.isPending}>
                      {crearCierre.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                      {crearCierre.isPending ? T.cierre.creando : T.cierre.crear}
                    </Button>
                  )}
                  {estado.partidaCierre?.estado === "borrador" && !estado.ejercicioCerrado && (
                    <Button variant="outline" onClick={() => void consulta.refetch()}>
                      {T.cierre.actualizar}
                    </Button>
                  )}
                  {puedeConfirmarEjercicio && (
                    <Button onClick={() => confirmarCierre.mutate()} disabled={confirmarCierre.isPending}>
                      {confirmarCierre.isPending && (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      )}
                      {confirmarCierre.isPending ? T.cierre.confirmando : T.cierre.confirmar}
                    </Button>
                  )}
                </div>
              </Card>
              <div className="flex justify-start">
                <Button variant="outline" onClick={() => setPaso(2)}>
                  <ArrowLeft aria-hidden="true" />
                  {T.volver}
                </Button>
              </div>
            </section>
          )}

          {paso === 4 && (
            <section aria-labelledby="titulo-reapertura" className="grid gap-4">
              <Card className="grid gap-4 p-5">
                <div>
                  <h2 id="titulo-reapertura" className="text-lg font-semibold">
                    {T.pasos[3]}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{T.reapertura.ayuda}</p>
                </div>
                {!estado.ejercicioCerrado && <Alert>{T.reapertura.ayuda}</Alert>}
                {estado.ejercicioCerrado && !estado.ejercicioSiguiente && (
                  <Alert>{T.reapertura.sinEjercicio}</Alert>
                )}
                {estado.ejercicioSiguiente && estado.vistaReapertura && (
                  <>
                    <p className="text-sm">
                      {T.titulo(estado.ejercicioSiguiente.anio)},{" "}
                      {formatearFecha(estado.ejercicioSiguiente.fechaInicio)}
                    </p>
                    <TablaPartidaAnual
                      lineas={estado.partidaReapertura?.lineas ?? estado.vistaReapertura.lineas}
                    />
                  </>
                )}
                {estado.partidaReapertura && (
                  <Alert>
                    {T.reapertura.partida(
                      formatearFecha(estado.partidaReapertura.fecha),
                      estado.partidaReapertura.estado,
                    )}
                  </Alert>
                )}
                {estado.partidaReapertura?.estado === "borrador" && (
                  <p className="text-sm text-muted-foreground">{T.reapertura.contabilizar}</p>
                )}
                {crearReapertura.isError && (
                  <Alert variant="error">{mensajeDeError(crearReapertura.error)}</Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  {puedeCrearPartidaReapertura && (
                    <Button onClick={() => crearReapertura.mutate()} disabled={crearReapertura.isPending}>
                      {crearReapertura.isPending && (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      )}
                      {crearReapertura.isPending ? T.reapertura.creando : T.reapertura.crear}
                    </Button>
                  )}
                  {estado.partidaReapertura?.estado === "borrador" && (
                    <Button variant="outline" onClick={() => void consulta.refetch()}>
                      {T.cierre.actualizar}
                    </Button>
                  )}
                </div>
              </Card>
              <div className="flex justify-start">
                <Button variant="outline" onClick={() => setPaso(3)}>
                  <ArrowLeft aria-hidden="true" />
                  {T.volver}
                </Button>
              </div>
            </section>
          )}

          {paso === 5 && (
            <section aria-labelledby="titulo-confirmacion-cierre" className="grid gap-4">
              <Card className="grid gap-4 p-5">
                <h2 id="titulo-confirmacion-cierre" className="text-lg font-semibold">
                  {T.confirmar.titulo}
                </h2>
                {cierreCompleto && reaperturaCompleta ? (
                  <>
                    <Alert>{T.confirmar.detalle}</Alert>
                    <p className="text-sm">
                      {T.cierre.partida(
                        formatearFecha(estado.partidaCierre!.fecha),
                        estado.partidaCierre!.estado,
                      )}
                    </p>
                    <p className="text-sm">
                      {T.reapertura.partida(
                        formatearFecha(estado.partidaReapertura!.fecha),
                        estado.partidaReapertura!.estado,
                      )}
                    </p>
                  </>
                ) : (
                  <Alert>{T.confirmar.pendiente}</Alert>
                )}
              </Card>
              <div className="flex justify-start">
                <Button variant="outline" onClick={() => setPaso(4)}>
                  <ArrowLeft aria-hidden="true" />
                  {T.volver}
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </Pagina>
  );
}
