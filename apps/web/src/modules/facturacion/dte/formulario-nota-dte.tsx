import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dinero,
  calcularTotalesNota,
  costoTotalDeEntrada,
  emitirNotaDteSchema,
  motivoCuentaNoPermitida,
  type ClasificacionContribuyente,
  type DteVista,
  type MotivoNota,
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
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { cuentasQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { cuentasTesoreriaQuery } from "@/modules/tesoreria/cuentas/cuentas-tesoreria-api";
import { disponibleNotaQuery } from "@/modules/comercial/notas/notas-api";
import { ventaQuery } from "@/modules/comercial/ventas/ventas-api";
import { dtesQuery, SIN_FILTROS_DTE, useEmitirNotaDte } from "./dte-api";
import { TEXTOS_DTE } from "./textos";

const T = TEXTOS_DTE.nota;
const CCF_VIGENTES = { ...SIN_FILTROS_DTE, tipo: "03", estado: "procesado" } as const;

interface Cargo {
  cuentaId: string;
  descripcion: string;
  monto: string;
}

const cargoVacio = (): Cargo => ({ cuentaId: "", descripcion: "", monto: "" });

function montoSeguro(texto: string): string {
  try {
    return Dinero.de(texto || "0").aTexto();
  } catch {
    return "0.00";
  }
}

interface Props {
  empresaId: string;
  abierto: boolean;
  onCerrar: () => void;
  onEmitida?: (dte: DteVista) => void;
}

/**
 * Emisión de notas de crédito y débito electrónicas (S4-T11, HU-55) sobre un CCF electrónico vigente: devolución o
 * rebaja (nota de crédito) o cargo adicional (nota de débito). La nota referencia al CCF y ajusta su IVA.
 */
export function FormularioNotaDte(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {props.abierto && <Contenido {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, onCerrar, onEmitida }: Props) {
  const puedeVerTesoreria = usePermiso("tesoreria.ver");
  const ccfs = useQuery(dtesQuery(empresaId, CCF_VIGENTES));
  const cuentasPago = useQuery({ ...cuentasTesoreriaQuery(empresaId), enabled: puedeVerTesoreria });
  const catalogo = useQuery(cuentasQuery(empresaId));
  const empresa = useQuery(empresaQuery(empresaId));
  const emitir = useEmitirNotaDte(empresaId);

  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [dteId, setDteId] = useState("");
  const [motivo, setMotivo] = useState<MotivoNota>("devolucion");
  const [cuentaPagoId, setCuentaPagoId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  /** Unidades o importe por orden de línea del CCF */
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [cargos, setCargos] = useState<Cargo[]>([cargoVacio()]);

  const ccf = ccfs.data?.find((d) => d.id === dteId);
  const documentoId = ccf?.documentoId ?? "";
  const venta = useQuery({ ...ventaQuery(empresaId, documentoId), enabled: documentoId !== "" });
  const disponible = useQuery({
    ...disponibleNotaQuery(empresaId, "venta", documentoId),
    enabled: documentoId !== "",
  });
  const conHijas = useMemo(
    () => new Set((catalogo.data ?? []).map((c) => c.cuentaPadreId).filter(Boolean)),
    [catalogo.data],
  );
  const cuentasCargo = (catalogo.data ?? [])
    .filter(
      (c) =>
        c.activa &&
        !conHijas.has(c.id) &&
        c.codigo.startsWith("5") &&
        !motivoCuentaNoPermitida("venta", c.codigo),
    )
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const cuentasEfectivo = (cuentasPago.data ?? []).filter((c) => c.activa);
  const alContado = venta.data?.condicionPago === "contado";
  const esCargo = motivo === "cargo";
  const tipoNota = esCargo ? "debito" : "credito";

  const elegirCcf = (id: string) => {
    setDteId(id);
    setCantidades({});
    setErrores({});
  };
  const cambiarMotivo = (m: MotivoNota) => {
    setMotivo(m);
    setCantidades({});
    setErrores({});
  };

  /** Importe de cada línea según lo digitado: unidades por precio en una devolución, el importe en una rebaja. */
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
    if (!venta.data) return null;
    const filas = esCargo
      ? cargos.map((c) => ({ monto: montoSeguro(c.monto), clase: "gravada" as const, bien: false }))
      : (disponible.data?.lineas ?? []).map((l) => ({
          monto: montoDe(l.orden),
          clase: l.clase,
          bien: l.productoId !== null,
        }));
    return calcularTotalesNota(
      {
        operacion: "venta",
        tipoDocumento: "ccf",
        lineas: filas,
        empresa: (empresa.data?.clasificacion ?? "otro") as ClasificacionContribuyente,
        tercero: "otro",
      },
      venta.data,
    );
    // montoDe depende de cantidades, motivo y disponible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta.data, esCargo, cargos, cantidades, motivo, disponible.data, empresa.data]);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (emitir.isPending) return;
    emitir.reset();
    const datos = {
      documentoId,
      tipo: tipoNota,
      motivo,
      cuentaPagoId: alContado ? cuentaPagoId : undefined,
      observaciones,
      lineas: esCargo
        ? cargos.map((c) => ({ cuentaId: c.cuentaId, descripcion: c.descripcion, monto: c.monto }))
        : Object.entries(cantidades)
            .filter(([, v]) => v.trim() !== "")
            .map(([orden, v]) => ({
              lineaOrden: Number(orden),
              ...(motivo === "devolucion" ? { cantidad: v } : { monto: v }),
            })),
    };
    const r = validarFormulario(emitirNotaDteSchema, datos);
    if (!r.ok) return setErrores(r.errores);
    emitir.mutate(r.datos, {
      onSuccess: (dte) => {
        toast.success(T.emitida(dte.numeroControl));
        onCerrar();
        onEmitida?.(dte);
      },
      onError: (error) => {
        if (error instanceof ErrorApi) setErrores(error.errores);
      },
    });
  }

  const error = (campo: string) => errores[campo]?.[0];
  const errorApi = emitir.error;
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
  const lista = ccfs.data ?? [];

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{T.numeroAutomatico}</p>

      <Campo id="nota-dte-ccf" etiqueta={T.ccf} error={error("documentoId")}>
        {(p) => (
          <NativeSelect {...p} className="h-10" value={dteId} onChange={(e) => elegirCcf(e.target.value)}>
            <option value="">{ccfs.isSuccess && lista.length === 0 ? T.sinCcf : T.elegirCcf}</option>
            {lista.map((d) => (
              <option key={d.id} value={d.id}>
                {d.numeroControl} · {d.receptor ?? TEXTOS_DTE.consumidorFinal} ·{" "}
                {formatearFecha(d.fechaEmision)} · {formatearDinero(d.total)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      {ccfs.isError && <Alert variant="error">{mensajeDeError(ccfs.error)}</Alert>}

      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm font-semibold">{T.motivo}</legend>
        {(["devolucion", "rebaja", "cargo"] as const).map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="motivo-nota-dte"
              className="size-4"
              checked={motivo === m}
              onChange={() => cambiarMotivo(m)}
            />
            {T.motivos[m]}
          </label>
        ))}
      </fieldset>
      <p className="text-sm">
        <span className="text-muted-foreground">{T.tipo}: </span>
        <strong>{T.tipos[tipoNota]}</strong>
      </p>

      {alContado && (
        <Campo
          id="nota-dte-cuenta-pago"
          etiqueta={T.cuentaPago}
          ayuda={T.cuentaPagoAyuda}
          error={error("cuentaPagoId")}
        >
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={cuentaPagoId}
              onChange={(e) => {
                setCuentaPagoId(e.target.value);
                setErrores(({ cuentaPagoId: _quitado, ...resto }) => resto);
              }}
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
          <legend className="text-sm font-semibold">{esCargo ? T.cargos : T.lineas}</legend>
          {disponible.isPending && !esCargo && (
            <p role="status" className="text-sm text-muted-foreground">
              {T.cargando}
            </p>
          )}
          {disponible.isError && <Alert variant="error">{mensajeDeError(disponible.error)}</Alert>}
          {sinNada && <p className="text-sm text-muted-foreground">{T.sinDisponible}</p>}
          {!esCargo &&
            lineasDisponibles.map((l) => {
              const bloqueada =
                motivo === "devolucion"
                  ? !l.productoId || Number(l.cantidadDisponible) <= 0
                  : Number(l.montoDisponible) <= 0;
              const etiqueta = motivo === "devolucion" ? T.devolver : T.rebajar;
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
                      {T.disponible}:{" "}
                      {motivo === "devolucion"
                        ? T.unidades(l.cantidadDisponible)
                        : formatearDinero(l.montoDisponible)}
                    </span>
                  </div>
                  <span className="hidden text-right text-xs text-muted-foreground sm:block">{etiqueta}</span>
                  <Input
                    aria-label={`${etiqueta} ${l.orden}`}
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
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
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
                  placeholder="0.00"
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
              onClick={() => setCargos((cs) => [...cs, cargoVacio()])}
            >
              <Plus aria-hidden="true" />
              {T.agregarCargo}
            </Button>
          )}
        </fieldset>
      )}

      <Campo id="nota-dte-observaciones" etiqueta={T.observaciones} error={error("observaciones")}>
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            maxLength={300}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        )}
      </Campo>

      {totales && (
        <>
          <dl
            aria-label={T.resumen.total}
            className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm"
          >
            <Resumen etiqueta={T.resumen.subtotal} valor={formatearDinero(totales.totalGravado)} />
            <Resumen etiqueta={T.resumen.iva} valor={formatearDinero(totales.iva)} />
            <Resumen etiqueta={T.resumen.total} valor={formatearDinero(totales.totalNeto)} fuerte />
          </dl>
          <p className="text-xs text-muted-foreground">{T.avisoTotal}</p>
        </>
      )}
      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={emitir.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={emitir.isPending || documentoId === ""}>
          {emitir.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {emitir.isPending ? T.emitiendo : T.emitir}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Resumen({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={fuerte ? "font-semibold tabular-nums" : "tabular-nums"}>{valor}</dd>
    </div>
  );
}
