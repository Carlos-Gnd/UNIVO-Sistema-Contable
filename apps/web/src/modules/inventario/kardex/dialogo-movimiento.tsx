import { useState, type FormEvent } from "react";
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
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { hoyIso } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { useRegistrarMovimiento } from "./kardex-api";
import { TEXTOS_KARDEX } from "./textos";

const T = TEXTOS_KARDEX.movimiento;

interface Props {
  empresaId: string;
  productoId: string;
  sucursalId: string;
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

function Contenido({ empresaId, productoId, sucursalId, onCerrar }: Props) {
  const [valores, setValores] = useState({
    tipo: "entrada",
    fecha: hoyIso(),
    cantidad: "",
    costoUnitario: "",
    referencia: "",
  });
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const registrar = useRegistrarMovimiento(empresaId);

  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores(({ [campo]: _quitado, ...resto }) => resto);
  };

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (registrar.isPending) return;
    registrar.reset();
    const r = validarFormulario(crearMovimientoSchema, {
      productoId,
      sucursalId,
      ...valores,
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
              onChange={(e) => cambiar("tipo", e.target.value)}
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
