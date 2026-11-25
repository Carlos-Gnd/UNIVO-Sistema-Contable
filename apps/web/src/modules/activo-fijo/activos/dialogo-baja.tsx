import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { darBajaActivoSchema, Dinero, type ActivoFijoVista } from "@contable/shared";
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
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { useDarDeBaja } from "./activos-api";
import { TEXTOS_ACTIVOS } from "./textos";

const T = TEXTOS_ACTIVOS.baja;

interface DialogoBajaProps {
  empresaId: string;
  /** Activo que se quiere dar de baja; sin él el diálogo está cerrado */
  activo: ActivoFijoVista | undefined;
  onCerrar: () => void;
}

/** Baja de un activo con la vista previa de su partida (S3-T128, HU-81). */
export function DialogoBaja(props: DialogoBajaProps) {
  return (
    <Dialog open={props.activo !== undefined} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        {props.activo && <Formulario {...props} activo={props.activo} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ empresaId, activo, onCerrar }: DialogoBajaProps & { activo: ActivoFijoVista }) {
  const baja = useDarDeBaja(empresaId, activo.id);
  const hoy = hoyIso();
  const [fecha, setFecha] = useState(hoy < activo.fechaAdquisicion ? activo.fechaAdquisicion : hoy);
  const [errores, setErrores] = useState<ErroresPorCampo>({});

  const acumulada = Dinero.de(activo.depreciacionAcumulada);
  const perdida = Dinero.de(activo.costo).menos(acumulada);
  const renglones = [
    ...(acumulada.esCero() ? [] : [{ nombre: T.depreciacion, debe: acumulada, haber: Dinero.cero() }]),
    ...(perdida.esCero() ? [] : [{ nombre: T.perdida, debe: perdida, haber: Dinero.cero() }]),
    { nombre: `${T.activo} · ${activo.nombre}`, debe: Dinero.cero(), haber: Dinero.de(activo.costo) },
  ];

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (baja.isPending) return;
    baja.reset();
    const r = validarFormulario(darBajaActivoSchema, { fecha });
    if (!r.ok) return setErrores(r.errores);
    if (r.datos.fecha < activo.fechaAdquisicion) {
      return setErrores({ fecha: [T.fechaAyuda(formatearFecha(activo.fechaAdquisicion))] });
    }
    setErrores({});
    baja.mutate(r.datos, {
      onSuccess: (resultado) => {
        toast.success(T.exito(resultado.activo.codigo, resultado.partida.numero));
        onCerrar();
      },
      onError: (error) => error instanceof ErrorApi && setErrores(error.errores),
    });
  }

  const error = baja.error;
  const aviso =
    error && !(error instanceof ErrorApi && error.estado === 400 && error.errores)
      ? mensajeDeError(error)
      : null;

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo(activo.codigo)}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <Campo
        id="baja-fecha"
        etiqueta={T.fecha}
        ayuda={T.fechaAyuda(formatearFecha(activo.fechaAdquisicion))}
        error={errores["fecha"]?.[0]}
        className="sm:w-56"
      >
        {(p) => (
          <Input
            {...p}
            type="date"
            className="h-10 tabular-nums"
            min={activo.fechaAdquisicion}
            value={fecha}
            disabled={baja.isPending}
            onChange={(e) => {
              setFecha(e.target.value);
              setErrores({});
            }}
          />
        )}
      </Campo>

      <table className="w-full overflow-hidden rounded-2xl bg-muted/40 text-sm">
        <thead className="sr-only">
          <tr>
            <th>Cuenta</th>
            <th>{T.debe}</th>
            <th>{T.haber}</th>
          </tr>
        </thead>
        <tbody>
          {renglones.map((r) => (
            <tr key={r.nombre} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">{r.nombre}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {r.debe.esCero() ? "" : formatearDinero(r.debe, { simbolo: false })}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.haber.esCero() ? "" : formatearDinero(r.haber, { simbolo: false })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={baja.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" variant="destructive" disabled={baja.isPending}>
          {baja.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {baja.isPending ? T.procesando : T.confirmar}
        </Button>
      </DialogFooter>
    </form>
  );
}
