import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Dinero, crearAbonoSchema, type DocumentoPendiente, type OperacionComercial } from "@contable/shared";
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
import { cuentasTesoreriaQuery } from "@/modules/tesoreria/cuentas/cuentas-tesoreria-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { useRegistrarAbono } from "./cobros-pagos-api";
import { repartirAbono } from "./reparto";
import { TEXTOS_COBROS_PAGOS } from "./textos";

const T = TEXTOS_COBROS_PAGOS.dialogo;

interface Props {
  empresaId: string;
  operacion: OperacionComercial;
  /** Documentos elegidos, del que vence antes al que vence después; todos del mismo cliente o proveedor */
  documentos: readonly DocumentoPendiente[];
  abierto: boolean;
  onCerrar: () => void;
  onRegistrado: () => void;
}

/** Diálogo de cobro (clientes) o pago (proveedores) a uno o varios documentos al crédito (HU-62). */
export function DialogoAbono(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {props.abierto && <Contenido {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, operacion, documentos, onCerrar, onRegistrado }: Props) {
  const lado = operacion === "venta" ? "cobrar" : "pagar";
  const puedeVerTesoreria = usePermiso("tesoreria.ver");
  const cuentasPago = useQuery({ ...cuentasTesoreriaQuery(empresaId), enabled: puedeVerTesoreria });
  const registrar = useRegistrarAbono(empresaId);
  const saldoTotal = useMemo(() => Dinero.sumar(documentos.map((d) => d.saldo)).aTexto(), [documentos]);

  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [valores, setValores] = useState({
    monto: saldoTotal,
    fecha: hoyIso(),
    cuentaPagoId: "",
    referencia: "",
    observaciones: "",
  });
  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores(({ [campo]: _quitado, ...resto }) => resto);
  };

  const montoValido = (() => {
    try {
      return Dinero.de(valores.monto || "0");
    } catch {
      return Dinero.cero();
    }
  })();
  const excede = montoValido.mayorQue(saldoTotal);
  const reparto = repartirAbono(documentos, excede ? saldoTotal : montoValido.aTexto());
  const cuentasEfectivo = (cuentasPago.data ?? []).filter((c) => c.activa);
  const tercero = documentos[0]?.tercero;

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (registrar.isPending || !documentos[0] || !tercero) return;
    registrar.reset();
    const datos = {
      operacion,
      sucursalId: documentos[0].sucursalId,
      terceroId: tercero.id,
      fecha: valores.fecha,
      cuentaPagoId: valores.cuentaPagoId,
      referencia: valores.referencia,
      observaciones: valores.observaciones,
      aplicaciones: reparto,
    };
    const r = validarFormulario(crearAbonoSchema, datos);
    if (!r.ok) return setErrores(r.errores);
    registrar.mutate(r.datos, {
      onSuccess: (guardado) => {
        toast.success(T.registrado(formatearDinero(guardado.monto)));
        onRegistrado();
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
    error("aplicaciones") ??
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo[lado]}</DialogTitle>
        <DialogDescription>
          {tercero ? `${T.tercero[lado]}: ${tercero.nombre}. ` : ""}
          {T.descripcion}
        </DialogDescription>
      </DialogHeader>

      <Campo
        id="abono-monto"
        etiqueta={T.monto}
        ayuda={T.montoAyuda(formatearDinero(saldoTotal))}
        error={error("monto") ?? (excede ? T.montoExcede : undefined)}
      >
        {(p) => (
          <Input
            {...p}
            className="h-10 tabular-nums"
            inputMode="decimal"
            value={valores.monto}
            onChange={(e) => cambiar("monto", e.target.value)}
          />
        )}
      </Campo>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="abono-fecha" etiqueta={T.fecha} error={error("fecha")}>
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
        <Campo id="abono-cuenta" etiqueta={T.cuenta[lado]} error={error("cuentaPagoId")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.cuentaPagoId}
              onChange={(e) => cambiar("cuentaPagoId", e.target.value)}
            >
              <option value="">{T.cuentaVacia}</option>
              {cuentasEfectivo.map((c) => (
                <option key={c.id} value={c.cuentaId}>
                  {c.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
      </div>

      <Campo
        id="abono-referencia"
        etiqueta={T.referencia}
        ayuda={T.referenciaAyuda}
        error={error("referencia")}
      >
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

      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-semibold">{T.reparto}</legend>
        <p className="text-xs text-muted-foreground">{T.repartoAyuda}</p>
        <ul aria-label={T.reparto} className="grid gap-1 text-sm">
          {reparto.map((r) => {
            const d = documentos.find((x) => x.id === r.documentoId)!;
            return (
              <li key={r.documentoId} className="flex justify-between gap-3">
                <span className="truncate text-muted-foreground">
                  {TEXTOS_COBROS_PAGOS.tiposDocumento[d.tipoDocumento]} {d.numeroDocumento}
                </span>
                <span className="tabular-nums">{formatearDinero(r.monto)}</span>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <Campo id="abono-observaciones" etiqueta={T.observaciones} error={error("observaciones")}>
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

      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={registrar.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={registrar.isPending || reparto.length === 0}>
          {registrar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {registrar.isPending ? T.guardando : T.guardar[lado]}
        </Button>
      </DialogFooter>
    </form>
  );
}
