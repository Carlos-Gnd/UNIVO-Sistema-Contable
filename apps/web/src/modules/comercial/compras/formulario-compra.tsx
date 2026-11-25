import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dinero,
  calcularTotalesDocumento,
  costoTotalDeEntrada,
  crearCompraSchema,
  type ClaseGravamen,
  type ClasificacionContribuyente,
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
import { formatearDinero, hoyIso } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { cuentasQuery, sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { productosQuery } from "@/modules/inventario/productos/productos-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { cuentasTesoreriaQuery } from "@/modules/tesoreria/cuentas/cuentas-tesoreria-api";
import { tercerosQuery } from "../terceros/terceros-api";
import { useRegistrarCompra } from "./compras-api";
import { TEXTOS_COMPRAS } from "./textos";

const T = TEXTOS_COMPRAS.formulario;

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

interface Props {
  empresaId: string;
  abierto: boolean;
  onCerrar: () => void;
}

/** Diálogo de registro de una compra (HU-59, S3-T62): documento del proveedor, líneas, pago y totales. */
export function FormularioCompra(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {props.abierto && <Contenido {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, onCerrar }: Props) {
  const puedeVerTesoreria = usePermiso("tesoreria.ver");
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const proveedores = useQuery(
    tercerosQuery(empresaId, { rol: "proveedor", busqueda: "", estado: "activos" }),
  );
  const productos = useQuery(productosQuery(empresaId, { busqueda: "", categoriaId: "", estado: "activos" }));
  const cuentasPago = useQuery({ ...cuentasTesoreriaQuery(empresaId), enabled: puedeVerTesoreria });
  const catalogo = useQuery(cuentasQuery(empresaId));
  const empresa = useQuery(empresaQuery(empresaId));
  const registrar = useRegistrarCompra(empresaId);

  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [valores, setValores] = useState({
    sucursalId: "",
    tipoDocumento: "ccf",
    numeroDocumento: "",
    fecha: hoyIso(),
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
  const cuentasDestino = (catalogo.data ?? [])
    .filter((c) => c.activa && !conHijas.has(c.id) && /^[1-4]/.test(c.codigo) && !c.codigo.startsWith("1101"))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const proveedor = proveedores.data?.find((p) => p.id === valores.terceroId);
  const productoDe = (id: string) => productos.data?.find((p) => p.id === id);

  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores(({ [campo]: _quitado, ...resto }) => resto);
  };
  const cambiarLinea = (i: number, campo: keyof LineaForm, valor: string) => {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
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
  const totales = useMemo(() => {
    const clasif = (empresa.data?.clasificacion ?? "otro") as ClasificacionContribuyente;
    return calcularTotalesDocumento({
      operacion: "compra",
      tipoDocumento: valores.tipoDocumento === "factura" ? "factura" : "ccf",
      lineas: lineas.map((l) => ({ monto: montoLinea(l), clase: l.clase, bien: mercaderia })),
      empresa: clasif,
      tercero: proveedor?.clasificacion ?? "otro",
    });
  }, [lineas, mercaderia, valores.tipoDocumento, empresa.data, proveedor]);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (registrar.isPending) return;
    registrar.reset();
    const datos = {
      sucursalId,
      tipoDocumento: valores.tipoDocumento,
      numeroDocumento: valores.numeroDocumento,
      fecha: valores.fecha,
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
        series: productoDe(l.productoId)?.controlaSeries
          ? l.series
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      })),
    };
    const r = validarFormulario(crearCompraSchema, datos);
    if (!r.ok) return setErrores(r.errores);
    registrar.mutate(r.datos, {
      onSuccess: (guardada) => {
        toast.success(T.registrada(guardada.numeroDocumento));
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
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);
  const hayRetencion = totales.ivaRetenido !== "0.00";
  const hayPercepcion = totales.ivaPercibido !== "0.00";

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="compra-tipo" etiqueta={T.tipoDocumento} error={error("tipoDocumento")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.tipoDocumento}
              onChange={(e) => cambiar("tipoDocumento", e.target.value)}
            >
              <option value="ccf">{TEXTOS_COMPRAS.tiposDocumento.ccf}</option>
              <option value="factura">{TEXTOS_COMPRAS.tiposDocumento.factura}</option>
            </NativeSelect>
          )}
        </Campo>
        <Campo id="compra-numero" etiqueta={T.numero} error={error("numeroDocumento")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              maxLength={60}
              placeholder={T.numeroEjemplo}
              autoFocus
              value={valores.numeroDocumento}
              onChange={(e) => cambiar("numeroDocumento", e.target.value.toUpperCase())}
            />
          )}
        </Campo>
        <Campo id="compra-proveedor" etiqueta={T.proveedor} error={error("terceroId")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.terceroId}
              onChange={(e) => cambiar("terceroId", e.target.value)}
            >
              <option value="">{T.elige}</option>
              {(proveedores.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id="compra-fecha" etiqueta={T.fecha} error={error("fecha")}>
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
        <Campo id="compra-sucursal" etiqueta={T.sucursal} error={error("sucursalId")}>
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
        <Campo id="compra-destino" etiqueta={T.destino}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={mercaderia ? "mercaderia" : "otro"}
              onChange={(e) => cambiarDestino(e.target.value === "mercaderia")}
            >
              <option value="mercaderia">{T.destinoMercaderia}</option>
              <option value="otro">{T.destinoOtro}</option>
            </NativeSelect>
          )}
        </Campo>
      </div>
      {proveedores.isSuccess && proveedores.data.length === 0 && <Alert>{T.sinProveedores}</Alert>}

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">{T.lineas}</legend>
        {lineas.map((l, i) => (
          <div key={i} className="grid gap-2 rounded-xl border p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_90px_110px_130px_auto]">
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
                  {cuentasDestino.map((c) => (
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
                value={l.cantidad}
                onChange={(e) => cambiarLinea(i, "cantidad", e.target.value)}
              />
              <Input
                aria-label={`${T.precio} ${i + 1}`}
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
                aria-label={`${T.descripcion_} ${i + 1}`}
                className="h-10"
                maxLength={200}
                placeholder={T.descripcion_}
                value={l.descripcion}
                onChange={(e) => cambiarLinea(i, "descripcion", e.target.value)}
              />
            )}
            {mercaderia && productoDe(l.productoId)?.controlaSeries && (
              <Textarea
                aria-label={`${T.series} ${i + 1}`}
                placeholder={T.series}
                rows={3}
                value={l.series}
                onChange={(e) => cambiarLinea(i, "series", e.target.value)}
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
                name="condicion-pago"
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
            <Campo id="compra-cuenta-pago" etiqueta={T.cuentaPago} error={error("cuentaPagoId")}>
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
            id="compra-dias"
            etiqueta={T.diasCredito}
            ayuda={`${T.diasCreditoAyuda} ${T.queda}`}
            error={error("diasCredito")}
          >
            {(p) => (
              <Input
                {...p}
                className="h-10 tabular-nums"
                inputMode="numeric"
                placeholder={String(proveedor?.diasCredito ?? 0)}
                value={valores.diasCredito}
                onChange={(e) => cambiar("diasCredito", e.target.value)}
              />
            )}
          </Campo>
        )}
      </fieldset>

      <Campo id="compra-observaciones" etiqueta={T.observaciones} error={error("observaciones")}>
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
        <Resumen etiqueta={T.resumen.total} valor={formatearDinero(totales.total)} fuerte />
        {hayRetencion && (
          <Resumen etiqueta={T.resumen.neto} valor={formatearDinero(totales.totalNeto)} fuerte />
        )}
      </dl>
      {valores.tipoDocumento === "factura" && (
        <p className="text-xs text-muted-foreground">{T.avisoFactura}</p>
      )}
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

function Resumen({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={fuerte ? "font-semibold tabular-nums" : "tabular-nums"}>{valor}</dd>
    </div>
  );
}
