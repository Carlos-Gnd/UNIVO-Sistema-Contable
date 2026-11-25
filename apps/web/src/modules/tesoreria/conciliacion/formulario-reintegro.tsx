import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { reintegrarCajaChicaSchema, type CuentaTesoreriaVista } from "@contable/shared";
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
import { useReintegrarCajaChica } from "./caja-chica-api";
import { TEXTOS_CAJA_CHICA as T } from "./textos";

interface Props {
  empresaId: string;
  cajaChicaId: string;
  cuentasOrigen: readonly CuentaTesoreriaVista[];
  abierto: boolean;
  onCerrar: () => void;
}

export function FormularioReintegroCajaChica(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, cajaChicaId, cuentasOrigen, onCerrar }: Props) {
  const [fecha, setFecha] = useState(hoyIso());
  const [cuentaOrigenId, setCuentaOrigenId] = useState("");
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const reintegrar = useReintegrarCajaChica(empresaId, cajaChicaId);
  const pendiente = reintegrar.isPending;
  const apiError = reintegrar.error;

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendiente) return;
    reintegrar.reset();
    const resultado = validarFormulario(reintegrarCajaChicaSchema, { fecha, cuentaOrigenId });
    if (!resultado.ok) return setErrores(resultado.errores);
    reintegrar.mutate(resultado.datos, {
      onSuccess: () => {
        toast.success(T.reintegroCreado);
        onCerrar();
      },
      onError: (error) => {
        if (error instanceof ErrorApi) setErrores(error.errores);
      },
    });
  }

  const aviso =
    errores._formulario?.[0] ??
    (apiError && !(apiError instanceof ErrorApi && apiError.estado === 400)
      ? mensajeDeError(apiError)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.reintegro.titulo}</DialogTitle>
        <DialogDescription>{T.reintegro.descripcion}</DialogDescription>
      </DialogHeader>
      <Campo id="reintegro-fecha" etiqueta={T.reintegro.fecha} error={errores["fecha"]?.[0]}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            type="date"
            value={fecha}
            onChange={(evento) => {
              setFecha(evento.target.value);
              setErrores(({ fecha: _anterior, ...resto }) => resto);
            }}
          />
        )}
      </Campo>
      <Campo id="reintegro-origen" etiqueta={T.reintegro.origen} error={errores["cuentaOrigenId"]?.[0]}>
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={cuentaOrigenId}
            onChange={(evento) => {
              setCuentaOrigenId(evento.target.value);
              setErrores(({ cuentaOrigenId: _anterior, ...resto }) => resto);
            }}
          >
            <option value="">{T.reintegro.origen}</option>
            {cuentasOrigen.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {`${cuenta.cuentaCodigo} ${cuenta.cuentaNombre}`}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      {aviso && <Alert variant="error">{aviso}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
          {T.reintegro.cancelar}
        </Button>
        <Button type="submit" disabled={pendiente || cuentasOrigen.length === 0}>
          {pendiente ? T.reintegro.guardando : T.reintegro.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
