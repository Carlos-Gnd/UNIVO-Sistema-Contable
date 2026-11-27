import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dinero,
  calcularTotalesDocumento,
  costoTotalDeEntrada,
  emitirVentaDteSchema,
  motivoCuentaNoPermitida,
  type ClaseGravamen,
  type ClasificacionContribuyente,
  type DteVista,
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
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { formatearDinero } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { cuentasQuery, sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { productosQuery } from "@/modules/inventario/productos/productos-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { cuentasTesoreriaQuery } from "@/modules/tesoreria/cuentas/cuentas-tesoreria-api";
import { tercerosQuery } from "@/modules/comercial/terceros/terceros-api";
import { SelectorSeriesVenta } from "@/modules/comercial/ventas/selector-series-venta";
import { useEmitirVentaDte } from "./dte-api";
import { TEXTOS_DTE } from "./textos";

const T = TEXTOS_DTE.venta;

export type TipoVentaDte = "factura" | "ccf";

interface LineaForm {
  productoId: string;
  cuentaId: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  clase: ClaseGravamen;
  series: string;
}

const lineaVacia = (): LineaForm => ({
  productoId: "",
  cuentaId: "",
  descripcion: "",
  cantidad: "1",
  precioUnitario: "",
  clase: "gravada",
  series: "",
});

const numerosDe = (texto: string) =>
  texto
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter(Boolean);

interface Props {
  empresaId: string;
  /** Tipo de documento que se emite; null cierra el diálogo */
  tipo: TipoVentaDte | null;
  onCerrar: () => void;
  /** Recibe el DTE emitido, por ejemplo para abrir su representación gráfica */
  onEmitido?: (dte: DteVista) => void;
}

/**
 * Emisión de una factura electrónica (S4-T05, HU-53) o de un comprobante de crédito fiscal electrónico (S4-T08,
 * HU-54). La factura admite consumidor final y su precio incluye el IVA; el CCF exige un cliente con NRC y su precio
 * va sin IVA. El número de control y la fecha los asigna la API al emitir.
 */
export function FormularioVentaDte(props: Props) {
  return (
    <Dialog open={props.tipo !== null} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {props.tipo !== null && <Contenido key={props.tipo} {...props} tipo={props.tipo} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, tipo, onCerrar, onEmitido }: Props & { tipo: TipoVentaDte }) {
  const ccf = tipo === "ccf";
  const puedeVerTesoreria = usePermiso("tesoreria.ver");
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const clientes = useQuery(tercerosQuery(empresaId, { rol: "cliente", busqueda: "", estado: "activos" }));
  const productos = useQuery(productosQuery(empresaId, { busqueda: "", categoriaId: "", estado: "activos" }));
  const cuentasPago = useQuery({ ...cuentasTesoreriaQuery(empresaId), enabled: puedeVerTesoreria });
  const catalogo = useQuery(cuentasQuery(empresaId));
  const empresa = useQuery(empresaQuery(empresaId));
  const emitir = useEmitirVentaDte(empresaId);

  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [valores, setValores] = useState({
    sucursalId: "",
    terceroId: "",
    condicionPago: "contado",
    cuentaPagoId: "",
    diasCredito: "",
    observaciones: "",
  });
  const [mercaderia, setMercaderia] = useState(true);
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()]);

  const activas = (sucursales.data ?? []).filter((s) => s.activa);
  const sucursalId = valores.sucursalId || activas.find((s) => s.esMatriz)?.id || activas[0]?.id || "";
  const cuentasEfectivo = (cuentasPago.data ?? []).filter((c) => c.activa);
  const conHijas = useMemo(
    () => new Set((catalogo.data ?? []).map((c) => c.cuentaPadreId).filter(Boolean)),
    [catalogo.data],
  );
  const cuentasIngreso = (catalogo.data ?? [])
    .filter((c) => c.activa && !conHijas.has(c.id) && !motivoCuentaNoPermitida("venta", c.codigo))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const cliente = clientes.data?.find((p) => p.id === valores.terceroId);
  const productoDe = (id: string) => productos.data?.find((p) => p.id === id);

  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    // Las series elegidas son de una sucursal: al cambiarla se vuelven a elegir
    if (campo === "sucursalId") {
      setLineas((ls) =>
        ls.map((l) => (productoDe(l.productoId)?.controlaSeries ? { ...l, series: "", cantidad: "0" } : l)),
      );
    }
    setErrores(({ [campo]: _quitado, ...resto }) => resto);
  };
  /** Al elegir un producto se propone su precio de venta; en la factura incluye el IVA. */
  const precioSugerido = (productoId: string): string => {
    const precio = productoDe(productoId)?.precioVenta;
    if (!precio || precio === "0.00") return "";
    return ccf ? precio : Dinero.de(precio).por("1.13").aTexto();
  };
  const cambiarLinea = (i: number, campo: keyof LineaForm, valor: string) => {
    setLineas((ls) =>
      ls.map((l, j) =>
        j === i
          ? {
              ...l,
              [campo]: valor,
              ...(campo === "productoId"
                ? {
                    precioUnitario: precioSugerido(valor),
                    series: "",
                    cantidad: productoDe(valor)?.controlaSeries ? "0" : l.cantidad,
                  }
                : {}),
            }
          : l,
      ),
    );
    setErrores(({ lineas: _quitado, ...resto }) => resto);
  };
  /** Con series la cantidad es el número de series elegidas. */
  const cambiarSeries = (i: number, series: string[]) => {
    setLineas((ls) =>
      ls.map((l, j) => (j === i ? { ...l, series: series.join("\n"), cantidad: String(series.length) } : l)),
    );
    setErrores(({ lineas: _quitado, ...resto }) => resto);
  };
  const cambiarDestino = (valor: boolean) => {
    setMercaderia(valor);
    setLineas([lineaVacia()]);
  };

  const montoLinea = (l: LineaForm): string => {
    try {
      return costoTotalDeEntrada(l.cantidad || "0", l.precioUnitario || "0");
    } catch {
      return "0.00";
    }
  };
  const totales = useMemo(
    () =>
      calcularTotalesDocumento({
        operacion: "venta",
        tipoDocumento: tipo,
        lineas: lineas.map((l) => ({ monto: montoLinea(l), clase: l.clase, bien: mercaderia })),
        empresa: (empresa.data?.clasificacion ?? "otro") as ClasificacionContribuyente,
        tercero: cliente?.clasificacion ?? "otro",
      }),
    [lineas, mercaderia, tipo, empresa.data, cliente],
  );

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (emitir.isPending) return;
    emitir.reset();
    const datos = {
      tipoDocumento: tipo,
      sucursalId,
      terceroId: valores.terceroId,
      condicionPago: valores.condicionPago,
      cuentaPagoId: valores.condicionPago === "contado" ? valores.cuentaPagoId : undefined,
      diasCredito: valores.condicionPago === "credito" ? valores.diasCredito : undefined,
      observaciones: valores.observaciones,
      lineas: lineas.map((l) => ({
        productoId: mercaderia ? l.productoId : undefined,
        cuentaId: mercaderia ? undefined : l.cuentaId,
        descripcion: mercaderia ? undefined : l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        clase: l.clase,
        series: mercaderia && productoDe(l.productoId)?.controlaSeries ? numerosDe(l.series) : undefined,
      })),
    };
    const r = validarFormulario(emitirVentaDteSchema, datos);
    if (!r.ok) return setErrores(r.errores);
    emitir.mutate(r.datos, {
      onSuccess: (dte) => {
        toast.success(T.emitido(dte.numeroControl));
        onCerrar();
        onEmitido?.(dte);
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
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);
  const hayRetencion = totales.ivaRetenido !== "0.00";
  const hayPercepcion = totales.ivaPercibido !== "0.00";
  const prefijo = `dte-${tipo}`;

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo[tipo]}</DialogTitle>
        <DialogDescription>{T.descripcion[tipo]}</DialogDescription>
      </DialogHeader>
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{T.numeroAutomatico}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          id={`${prefijo}-cliente`}
          etiqueta={ccf ? T.clienteCcf : T.cliente}
          ayuda={cliente ? T.datosCliente(cliente.nit, cliente.nrc) : undefined}
          error={error("terceroId")}
        >
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.terceroId}
              onChange={(e) => cambiar("terceroId", e.target.value)}
            >
              <option value="">{ccf ? T.elige : T.consumidor}</option>
              {(clientes.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id={`${prefijo}-sucursal`} etiqueta={T.sucursal} error={error("sucursalId")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={sucursalId}
              onChange={(e) => cambiar("sucursalId", e.target.value)}
            >
              {activas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id={`${prefijo}-destino`} etiqueta={T.destino}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={mercaderia ? "mercaderia" : "otro"}
              onChange={(e) => cambiarDestino(e.target.value === "mercaderia")}
            >
              <option value="mercaderia">{T.destinoMercaderia}</option>
              <option value="otro">{T.destinoServicio}</option>
            </NativeSelect>
          )}
        </Campo>
      </div>
      {clientes.isSuccess && clientes.data.length === 0 && <Alert>{T.sinClientes}</Alert>}
      {ccf && cliente && !cliente.nrc && <Alert variant="error">{T.sinNrc}</Alert>}

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">{T.lineas}</legend>
        {lineas.map((l, i) => (
          <div key={i} className="grid gap-2 rounded-xl border p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_90px_120px_130px_auto]">
              {mercaderia ? (
                <NativeSelect
                  aria-label={`${T.producto} ${i + 1}`}
                  className="h-10"
                  value={l.productoId}
                  onChange={(e) => cambiarLinea(i, "productoId", e.target.value)}
                >
                  <option value="">{T.elige}</option>
                  {(productos.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} · {p.nombre}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <NativeSelect
                  aria-label={`${T.cuenta} ${i + 1}`}
                  className="h-10"
                  value={l.cuentaId}
                  onChange={(e) => cambiarLinea(i, "cuentaId", e.target.value)}
                >
                  <option value="">{T.elige}</option>
                  {cuentasIngreso.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} · {c.nombre}
                    </option>
                  ))}
                </NativeSelect>
              )}
              <Input
                aria-label={`${T.cantidad} ${i + 1}`}
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                readOnly={mercaderia && Boolean(productoDe(l.productoId)?.controlaSeries)}
                value={l.cantidad}
                onChange={(e) => cambiarLinea(i, "cantidad", e.target.value)}
              />
              <Input
                aria-label={`${T.precio[tipo]} ${i + 1}`}
                className="h-10 text-right tabular-nums"
                inputMode="decimal"
                placeholder="0.00"
                value={l.precioUnitario}
                onChange={(e) => cambiarLinea(i, "precioUnitario", e.target.value)}
              />
              <NativeSelect
                aria-label={`${T.clase} ${i + 1}`}
                className="h-10"
                value={l.clase}
                onChange={(e) => cambiarLinea(i, "clase", e.target.value)}
              >
                <option value="gravada">{T.clases.gravada}</option>
                <option value="exenta">{T.clases.exenta}</option>
                <option value="no_sujeta">{T.clases.no_sujeta}</option>
              </NativeSelect>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground"
                aria-label={T.quitarLinea(i + 1)}
                disabled={lineas.length === 1}
                onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            {!mercaderia && (
              <Input
                aria-label={`${T.descripcionLinea} ${i + 1}`}
                className="h-10"
                maxLength={200}
                placeholder={T.descripcionLinea}
                value={l.descripcion}
                onChange={(e) => cambiarLinea(i, "descripcion", e.target.value)}
              />
            )}
            {mercaderia && productoDe(l.productoId)?.controlaSeries && (
              <SelectorSeriesVenta
                empresaId={empresaId}
                productoId={l.productoId}
                sucursalId={sucursalId}
                etiqueta={`${T.series} ${i + 1}`}
                seleccion={numerosDe(l.series)}
                ocupadas={
                  new Set(
                    lineas.flatMap((otra, j) =>
                      j !== i && otra.productoId === l.productoId ? numerosDe(otra.series) : [],
                    ),
                  )
                }
                onCambiar={(series) => cambiarSeries(i, series)}
              />
            )}
          </div>
        ))}
        {error("lineas") && (
          <p role="alert" className="text-sm text-destructive">
            {error("lineas")}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start"
          onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
        >
          <Plus aria-hidden="true" />
          {T.agregarLinea}
        </Button>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">{T.pago}</legend>
        <div className="flex gap-4">
          {(["contado", "credito"] as const).map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${prefijo}-condicion`}
                className="size-4"
                checked={valores.condicionPago === c}
                onChange={() => cambiar("condicionPago", c)}
              />
              {c === "contado" ? T.contado : T.credito}
            </label>
          ))}
        </div>
        {valores.condicionPago === "contado" ? (
          <>
            <Campo id={`${prefijo}-cuenta-pago`} etiqueta={T.cuentaPago} error={error("cuentaPagoId")}>
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
            {cuentasPago.isSuccess && cuentasEfectivo.length === 0 && <Alert>{T.sinCuentasPago}</Alert>}
          </>
        ) : (
          <Campo
            id={`${prefijo}-dias`}
            etiqueta={T.diasCredito}
            ayuda={T.diasCreditoAyuda}
            error={error("diasCredito")}
          >
            {(p) => (
              <Input
                {...p}
                className="h-10 tabular-nums"
                inputMode="numeric"
                placeholder={String(cliente?.diasCredito ?? 0)}
                value={valores.diasCredito}
                onChange={(e) => cambiar("diasCredito", e.target.value)}
              />
            )}
          </Campo>
        )}
      </fieldset>

      <Campo id={`${prefijo}-observaciones`} etiqueta={T.observaciones} error={error("observaciones")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={300}
            value={valores.observaciones}
            onChange={(e) => cambiar("observaciones", e.target.value)}
          />
        )}
      </Campo>

      <dl
        aria-label={T.resumen.titulo}
        className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-3"
      >
        <Resumen
          etiqueta={T.resumen.subtotal}
          valor={formatearDinero(
            Dinero.sumar([totales.totalGravado, totales.totalExento, totales.totalNoSujeto]),
          )}
        />
        <Resumen etiqueta={T.resumen.iva} valor={formatearDinero(totales.iva)} />
        {hayPercepcion && (
          <Resumen etiqueta={T.resumen.percibido} valor={formatearDinero(totales.ivaPercibido)} />
        )}
        {hayRetencion && (
          <Resumen etiqueta={T.resumen.retenido} valor={formatearDinero(totales.ivaRetenido)} />
        )}
        <Resumen etiqueta={T.resumen.total} valor={formatearDinero(totales.totalNeto)} fuerte />
      </dl>
      {!ccf && <p className="text-xs text-muted-foreground">{T.avisoFactura}</p>}
      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={emitir.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={emitir.isPending || (ccf && Boolean(cliente) && !cliente?.nrc)}>
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
