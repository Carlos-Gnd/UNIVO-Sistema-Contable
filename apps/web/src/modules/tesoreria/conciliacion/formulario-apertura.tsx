import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { crearCajaChicaSchema, type CuentaTesoreriaVista, type SucursalDetalle } from "@contable/shared";
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
import { hoyIso } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { useAbrirCajaChica } from "./caja-chica-api";
import { TEXTOS_CAJA_CHICA as T } from "./textos";

interface Valores {
  sucursalId: string;
  cuentaTesoreriaId: string;
  cuentaOrigenId: string;
  fondoFijo: string;
  fecha: string;
}

interface Props {
  empresaId: string;
  sucursalId: string;
  sucursales: readonly SucursalDetalle[];
  cuentasTesoreria: readonly CuentaTesoreriaVista[];
  todasSucursales: boolean;
  abierto: boolean;
  onCerrar: () => void;
}

export function FormularioAperturaCajaChica(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-xl">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({
  empresaId,
  sucursalId,
  sucursales,
  cuentasTesoreria,
  todasSucursales,
  onCerrar,
}: Props) {
  const [valores, setValores] = useState<Valores>({
    sucursalId,
    cuentaTesoreriaId: "",
    cuentaOrigenId: "",
    fondoFijo: "200.00",
    fecha: hoyIso(),
  });
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const abrir = useAbrirCajaChica(empresaId);
  const sucursalesPermitidas = useMemo(() => sucursales.filter((sucursal) => sucursal.activa), [sucursales]);
  const cuentasCaja = useMemo(
    () =>
      cuentasTesoreria.filter(
        (cuenta) =>
          cuenta.activa &&
          cuenta.tipo === "caja" &&
          cuenta.cuentaCodigo.startsWith("110102") &&
          cuenta.sucursalId === valores.sucursalId,
      ),
    [cuentasTesoreria, valores.sucursalId],
  );
  const cuentasOrigen = useMemo(
    () =>
      cuentasTesoreria.filter(
        (cuenta) =>
          cuenta.activa &&
          cuenta.id !== valores.cuentaTesoreriaId &&
          (cuenta.sucursalId === valores.sucursalId || (todasSucursales && cuenta.sucursalId === null)),
      ),
    [cuentasTesoreria, todasSucursales, valores.cuentaTesoreriaId, valores.sucursalId],
  );
  const pendiente = abrir.isPending;
  const apiError = abrir.error;

  function cambiar(campo: keyof Valores, valor: string) {
    setValores((actuales) => ({ ...actuales, [campo]: valor }));
    setErrores(({ [campo]: _anterior, ...resto }) => resto);
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendiente) return;
    abrir.reset();
    const resultado = validarFormulario(crearCajaChicaSchema, valores);
    if (!resultado.ok) return setErrores(resultado.errores);
    abrir.mutate(resultado.datos, {
      onSuccess: () => {
        toast.success(T.abierto);
        onCerrar();
      },
      onError: (error) => {
        if (error instanceof ErrorApi) setErrores(error.errores);
      },
    });
  }

  const error = (campo: keyof Valores) => errores[campo]?.[0];
  const aviso =
    errores._formulario?.[0] ??
    (apiError && !(apiError instanceof ErrorApi && apiError.estado === 400)
      ? mensajeDeError(apiError)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.apertura.titulo}</DialogTitle>
        <DialogDescription>{T.apertura.descripcion}</DialogDescription>
      </DialogHeader>
      <Campo id="caja-chica-sucursal" etiqueta={T.apertura.sucursal} error={error("sucursalId")}>
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={valores.sucursalId}
            onChange={(evento) => cambiar("sucursalId", evento.target.value)}
          >
            <option value="">{T.elegirSucursal}</option>
            {sucursalesPermitidas.map((sucursal) => (
              <option key={sucursal.id} value={sucursal.id}>
                {sucursal.nombre}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      <Campo id="caja-chica-cuenta" etiqueta={T.apertura.caja} error={error("cuentaTesoreriaId")}>
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={valores.cuentaTesoreriaId}
            onChange={(evento) => cambiar("cuentaTesoreriaId", evento.target.value)}
          >
            <option value="">{T.apertura.caja}</option>
            {cuentasCaja.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {`${cuenta.cuentaCodigo} ${cuenta.cuentaNombre}`}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      <Campo id="caja-chica-origen" etiqueta={T.apertura.origen} error={error("cuentaOrigenId")}>
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={valores.cuentaOrigenId}
            onChange={(evento) => cambiar("cuentaOrigenId", evento.target.value)}
          >
            <option value="">{T.apertura.origen}</option>
            {cuentasOrigen.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {`${cuenta.cuentaCodigo} ${cuenta.cuentaNombre}`}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="caja-chica-fondo" etiqueta={T.apertura.monto} error={error("fondoFijo")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              type="number"
              min="0.01"
              step="0.01"
              value={valores.fondoFijo}
              onChange={(evento) => cambiar("fondoFijo", evento.target.value)}
            />
          )}
        </Campo>
        <Campo id="caja-chica-fecha-apertura" etiqueta={T.apertura.fecha} error={error("fecha")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              type="date"
              value={valores.fecha}
              onChange={(evento) => cambiar("fecha", evento.target.value)}
            />
          )}
        </Campo>
      </div>
      {aviso && <Alert variant="error">{aviso}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
          {T.apertura.cancelar}
        </Button>
        <Button type="submit" disabled={pendiente || cuentasCaja.length === 0 || cuentasOrigen.length === 0}>
          {pendiente ? T.apertura.guardando : T.apertura.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
