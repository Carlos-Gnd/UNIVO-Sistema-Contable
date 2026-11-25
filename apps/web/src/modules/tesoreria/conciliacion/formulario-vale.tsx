import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { crearValeCajaChicaSchema } from "@contable/shared";
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
import { useRegistrarValeCajaChica } from "./caja-chica-api";
import { cuentasGastoImputables } from "./cuentas-gasto";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import { TEXTOS_CAJA_CHICA as T } from "./textos";

interface Valores {
  fecha: string;
  comprobante: string;
  concepto: string;
  montoNeto: string;
  iva: string;
  cuentaGastoId: string;
}

interface Props {
  empresaId: string;
  cajaChicaId: string;
  cuentas: readonly CuentaCatalogo[];
  abierto: boolean;
  onCerrar: () => void;
}

export function FormularioValeCajaChica(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-xl">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, cajaChicaId, cuentas, onCerrar }: Props) {
  const [valores, setValores] = useState<Valores>({
    fecha: hoyIso(),
    comprobante: "",
    concepto: "",
    montoNeto: "",
    iva: "0.00",
    cuentaGastoId: "",
  });
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const registrar = useRegistrarValeCajaChica(empresaId, cajaChicaId);
  const cuentasGasto = useMemo(() => cuentasGastoImputables(cuentas), [cuentas]);
  const pendiente = registrar.isPending;
  const apiError = registrar.error;

  function cambiar(campo: keyof Valores, valor: string) {
    setValores((actuales) => ({ ...actuales, [campo]: valor }));
    setErrores(({ [campo]: _anterior, ...resto }) => resto);
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (pendiente) return;
    registrar.reset();
    const resultado = validarFormulario(crearValeCajaChicaSchema, valores);
    if (!resultado.ok) return setErrores(resultado.errores);
    registrar.mutate(resultado.datos, {
      onSuccess: () => {
        toast.success(T.valeRegistrado);
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
        <DialogTitle>{T.vale.titulo}</DialogTitle>
        <DialogDescription>{T.vale.descripcion}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="vale-fecha" etiqueta={T.vale.fecha} error={error("fecha")}>
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
        <Campo id="vale-comprobante" etiqueta={T.vale.comprobante} error={error("comprobante")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={60}
              value={valores.comprobante}
              onChange={(evento) => cambiar("comprobante", evento.target.value)}
            />
          )}
        </Campo>
      </div>
      <Campo id="vale-concepto" etiqueta={T.vale.concepto} error={error("concepto")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={200}
            value={valores.concepto}
            onChange={(evento) => cambiar("concepto", evento.target.value)}
          />
        )}
      </Campo>
      <Campo id="vale-cuenta-gasto" etiqueta={T.vale.cuentaGasto} error={error("cuentaGastoId")}>
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={valores.cuentaGastoId}
            onChange={(evento) => cambiar("cuentaGastoId", evento.target.value)}
          >
            <option value="">{T.vale.cuentaGasto}</option>
            {cuentasGasto.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {`${cuenta.codigo} ${cuenta.nombre}`}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="vale-neto" etiqueta={T.vale.neto} error={error("montoNeto")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              type="number"
              min="0"
              step="0.01"
              value={valores.montoNeto}
              onChange={(evento) => cambiar("montoNeto", evento.target.value)}
            />
          )}
        </Campo>
        <Campo id="vale-iva" etiqueta={T.vale.iva} error={error("iva")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              type="number"
              min="0"
              step="0.01"
              value={valores.iva}
              onChange={(evento) => cambiar("iva", evento.target.value)}
            />
          )}
        </Campo>
      </div>
      {aviso && <Alert variant="error">{aviso}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
          {T.vale.cancelar}
        </Button>
        <Button type="submit" disabled={pendiente || cuentasGasto.length === 0}>
          {pendiente ? T.vale.guardando : T.vale.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
