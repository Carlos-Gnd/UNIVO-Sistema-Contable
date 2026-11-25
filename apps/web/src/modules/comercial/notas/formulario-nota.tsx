import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dinero,
  calcularTotalesNota,
  costoTotalDeEntrada,
  crearNotaSchema,
  type ClasificacionContribuyente,
  type MotivoNota,
  type OperacionComercial,
} from "@contable/shared";
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
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { cuentasQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { cuentasTesoreriaQuery } from "@/modules/tesoreria/cuentas/cuentas-tesoreria-api";
import { comprasQuery } from "../compras/compras-api";
import { ventasQuery } from "../ventas/ventas-api";
import { disponibleNotaQuery, useRegistrarNota } from "./notas-api";
import { TEXTOS_NOTAS } from "./textos";

const T = TEXTOS_NOTAS.formulario;
const SIN_FILTROS = { busqueda: "", desde: "", hasta: "" };

interface Props {
  empresaId: string;
  operacion: OperacionComercial;
  abierto: boolean;
  onCerrar: () => void;
}

interface Cargo {
  cuentaId: string;
  descripcion: string;
  monto: string;
}

/** Diálogo de devolución, rebaja o cargo adicional sobre un documento (HU-61). */
export function FormularioNota(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {props.abierto && <Contenido {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, operacion, onCerrar }: Props) {
  const compra = operacion === "compra";
  const puedeVerTesoreria = usePermiso("tesoreria.ver");
  const compras = useQuery({ ...comprasQuery(empresaId, SIN_FILTROS), enabled: compra });
  const ventas = useQuery({ ...ventasQuery(empresaId, SIN_FILTROS), enabled: !compra });
  const documentos = (compra ? compras.data : ventas.data) ?? [];
  const cuentasPago = useQuery({ ...cuentasTesoreriaQuery(empresaId), enabled: puedeVerTesoreria });
  const catalogo = useQuery(cuentasQuery(empresaId));
  const empresa = useQuery(empresaQuery(empresaId));
  const registrar = useRegistrarNota(empresaId);

  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [documentoId, setDocumentoId] = useState("");
  const [motivo, setMotivo] = useState<MotivoNota>("devolucion");
  const [valores, setValores] = useState({
    numeroNota: "",
    fecha: hoyIso(),
    cuentaPagoId: "",
    observaciones: "",
  });
  /** Unidades o importe por orden de línea del documento */
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [cargos, setCargos] = useState<Cargo[]>([{ cuentaId: "", descripcion: "", monto: "" }]);

  const documento = documentos.find((d) => d.id === documentoId);
  const disponible = useQuery({
    ...disponibleNotaQuery(empresaId, operacion, documentoId),
    enabled: documentoId !== "",
  });
  const conHijas = useMemo(
    () => new Set((catalogo.data ?? []).map((c) => c.cuentaPadreId).filter(Boolean)),
    [catalogo.data],
  );
  const cuentasCargo = (catalogo.data ?? [])
    .filter((c) => c.activa && !conHijas.has(c.id) && c.codigo.startsWith(compra ? "4" : "5"))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const cuentasEfectivo = (cuentasPago.data ?? []).filter((c) => c.activa);
  const alContado = documento?.condicionPago === "contado";
  const esCargo = motivo === "cargo";

  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores(({ [campo]: _quitado, ...resto }) => resto);
  };
  const elegirDocumento = (id: string) => {
    setDocumentoId(id);
    setCantidades({});
    setErrores({});
  };
  const cambiarMotivo = (m: MotivoNota) => {
    setMotivo(m);
    setCantidades({});
    setErrores({});
  };

  /** Importe de cada línea del documento según lo digitado (unidades en una devolución, importe en una rebaja). */
  const montoDe = (orden: number): string => {
    const l = disponible.data?.lineas.find((x) => x.orden === orden);
    const texto = cantidades[orden];
    if (!l || !texto) return "0.00";
    try {
      return motivo === "devolucion"
        ? costoTotalDeEntrada(texto, l.precioUnitario)
        : Dinero.de(texto).aTexto();
    } catch {
      return "0.00";
    }
  };
  const totales = useMemo(() => {
    if (!documento) return null;
    const filas = esCargo
      ? cargos.map((c) => ({ monto: safeMonto(c.monto), clase: "gravada" as const }))
      : (disponible.data?.lineas ?? []).map((l) => ({ monto: montoDe(l.orden), clase: l.clase }));
    return calcularTotalesNota(
      {
        operacion,
        tipoDocumento: documento.tipoDocumento,
        lineas: filas,
        empresa: (empresa.data?.clasificacion ?? "otro") as ClasificacionContribuyente,
        tercero: "otro",
      },
      documento,
    );
    // montoDe depende de cantidades, motivo y disponible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documento, esCargo, cargos, cantidades, motivo, disponible.data, empresa.data, operacion]);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (registrar.isPending) return;
    registrar.reset();
    const datos = {
      documentoId,
      tipo: esCargo ? "debito" : "credito",
      motivo,
      numeroNota: valores.numeroNota,
      fecha: valores.fecha,
      cuentaPagoId: alContado ? valores.cuentaPagoId : undefined,
      observaciones: valores.observaciones,
      lineas: esCargo
        ? cargos.map((c) => ({ cuentaId: c.cuentaId, descripcion: c.descripcion, monto: c.monto }))
        : Object.entries(cantidades)
            .filter(([, v]) => v.trim() !== "")
            .map(([orden, v]) => ({
              lineaOrden: Number(orden),
              ...(motivo === "devolucion" ? { cantidad: v } : { monto: v }),
            })),
    };
    const r = validarFormulario(crearNotaSchema, datos);
    if (!r.ok) return setErrores(r.errores);
    registrar.mutate(r.datos, {
      onSuccess: (guardada) => {
        toast.success(T.registrada(guardada.numeroNota));
        onCerrar();
      },
      onError: (error) => {
        if (error instanceof ErrorApi) setErrores(error.errores);
      },
    });
  }

  const error = (campo: string) => errores[campo]?.[0];
  const errorApi = registrar.error;
  const aviso =
    errores._formulario?.[0] ??
    error("lineas") ??
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);
  const lineasDisponibles = disponible.data?.lineas ?? [];
  const sinNada =
    !esCargo &&
    disponible.isSuccess &&
    lineasDisponibles.every((l) =>
      motivo === "devolucion"
        ? Number(l.cantidadDisponible) <= 0 || !l.productoId
        : Number(l.montoDisponible) <= 0,
    );

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <Campo id="nota-documento" etiqueta={T.documento} error={error("documentoId")}>
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={documentoId}
            onChange={(e) => elegirDocumento(e.target.value)}
          >
            <option value="">{documentos.length === 0 ? T.sinDocumentos : T.elegirDocumento}</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.numeroDocumento} · {d.tercero?.nombre ?? TEXTOS_NOTAS.consumidorFinal} ·{" "}
                {formatearFecha(d.fecha)} · {formatearDinero(d.total)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>

      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm font-semibold">{T.motivo}</legend>
        {(["devolucion", "rebaja", "cargo"] as const).map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="motivo-nota"
              className="size-4"
              checked={motivo === m}
              onChange={() => cambiarMotivo(m)}
            />
            {TEXTOS_NOTAS.motivos[m]}
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="nota-numero" etiqueta={T.numero} error={error("numeroNota")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              maxLength={60}
              placeholder={T.numeroEjemplo}
              value={valores.numeroNota}
              onChange={(e) => cambiar("numeroNota", e.target.value.toUpperCase())}
            />
          )}
        </Campo>
        <Campo id="nota-fecha" etiqueta={T.fecha} error={error("fecha")}>
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

      {alContado && (
        <Campo
          id="nota-cuenta-pago"
          etiqueta={T.cuentaPago}
          ayuda={T.cuentaPagoAyuda}
          error={error("cuentaPagoId")}
        >
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.cuentaPagoId}
              onChange={(e) => cambiar("cuentaPagoId", e.target.value)}
            >
              <option value="">{T.elige}</option>
              {cuentasEfectivo.map((c) => (
                <option key={c.id} value={c.cuentaId}>
                  {c.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
      )}

      {documentoId !== "" && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">{esCargo ? T.agregarCargo : T.lineas}</legend>
          {disponible.isPending && !esCargo && (
            <p role="status" className="text-sm text-muted-foreground">
              {T.cargando}
            </p>
          )}
          {disponible.isError && <Alert variant="error">{mensajeDeError(disponible.error)}</Alert>}
          {disponible.isSuccess && documento?.condicionPago === "credito" && (
            <p className="text-xs text-muted-foreground">{T.saldo(formatearDinero(disponible.data.saldo))}</p>
          )}
          {sinNada && <p className="text-sm text-muted-foreground">{T.sinDisponible}</p>}
          {!esCargo &&
            lineasDisponibles.map((l) => {
              const bloqueada =
                motivo === "devolucion"
                  ? !l.productoId || Number(l.cantidadDisponible) <= 0
                  : Number(l.montoDisponible) <= 0;
              return (
                <div
                  key={l.orden}
                  className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_7rem]"
                >
                  <div className="min-w-0 text-sm">
                    <span className="block truncate">
                      {l.productoCodigo ? `${l.productoCodigo} · ` : ""}
                      {l.descripcion}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {motivo === "devolucion"
                        ? `${T.disponible}: ${T.unidades(l.cantidadDisponible)}`
                        : `${T.disponible}: ${formatearDinero(l.montoDisponible)}`}
                    </span>
                  </div>
                  <span className="hidden text-right text-xs text-muted-foreground sm:block">
                    {motivo === "devolucion" ? T.devolver : T.rebajar}
                  </span>
                  <Input
                    aria-label={`${motivo === "devolucion" ? T.devolver : T.rebajar} ${l.orden}`}
                    className="h-10 text-right tabular-nums"
                    inputMode="decimal"
                    disabled={bloqueada}
                    value={cantidades[l.orden] ?? ""}
                    onChange={(e) => setCantidades((c) => ({ ...c, [l.orden]: e.target.value }))}
                  />
                </div>
              );
            })}
          {esCargo &&
            cargos.map((c, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
                <NativeSelect
                  aria-label={`${T.cuentaCargo} ${i + 1}`}
                  className="h-10"
                  value={c.cuentaId}
                  onChange={(e) =>
                    setCargos((cs) => cs.map((x, j) => (j === i ? { ...x, cuentaId: e.target.value } : x)))
                  }
                >
                  <option value="">{T.cuentaCargo}</option>
                  {cuentasCargo.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.codigo} · {k.nombre}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  aria-label={`${T.descripcionCargo} ${i + 1}`}
                  className="h-10"
                  maxLength={200}
                  placeholder={T.descripcionCargo}
                  value={c.descripcion}
                  onChange={(e) =>
                    setCargos((cs) => cs.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))
                  }
                />
                <Input
                  aria-label={`${T.montoCargo} ${i + 1}`}
                  className="h-10 text-right tabular-nums"
                  inputMode="decimal"
                  placeholder={T.montoCargo}
                  value={c.monto}
                  onChange={(e) =>
                    setCargos((cs) => cs.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-muted-foreground"
                  aria-label={T.quitarCargo(i + 1)}
                  disabled={cargos.length === 1}
                  onClick={() => setCargos((cs) => cs.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          {esCargo && (
            <Button
              type="button"
              variant="ghost"
              className="justify-self-start"
              onClick={() => setCargos((cs) => [...cs, { cuentaId: "", descripcion: "", monto: "" }])}
            >
              <Plus aria-hidden="true" />
              {T.agregarCargo}
            </Button>
          )}
        </fieldset>
      )}

      <Campo id="nota-observaciones" etiqueta={T.observaciones} error={error("observaciones")}>
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            maxLength={300}
            value={valores.observaciones}
            onChange={(e) => cambiar("observaciones", e.target.value)}
          />
        )}
      </Campo>

      {totales && (
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
            <Resumen etiqueta={T.resumen.subtotal} valor={formatearDinero(totales.totalGravado)} />
            <Resumen etiqueta={T.resumen.iva} valor={formatearDinero(totales.iva)} />
            <Resumen etiqueta={T.resumen.total} valor={formatearDinero(totales.total)} fuerte />
            {totales.ivaRetenido !== "0.00" && (
              <Resumen etiqueta={T.resumen.neto} valor={formatearDinero(totales.totalNeto)} fuerte />
            )}
          </dl>
          <p className="text-xs text-muted-foreground">{T.avisoTotal}</p>
        </>
      )}
      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={registrar.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={registrar.isPending || documentoId === ""}>
          {registrar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {registrar.isPending ? T.guardando : T.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}

function safeMonto(texto: string): string {
  try {
    return Dinero.de(texto || "0").aTexto();
  } catch {
    return "0.00";
  }
}

function Resumen({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={fuerte ? "font-semibold tabular-nums" : "tabular-nums"}>{valor}</dd>
    </div>
  );
}
