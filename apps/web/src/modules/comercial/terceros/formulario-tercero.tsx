import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  crearTerceroSchema,
  editarTerceroSchema,
  type EditarTercero,
  type RolTercero,
  type TerceroVista,
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
import { validarFormulario } from "@/lib/validacion";
import { useCrearTercero, useEditarTercero } from "./terceros-api";
import { TEXTOS_TERCEROS } from "./textos";

const T = TEXTOS_TERCEROS.formulario;

interface Valores {
  nombre: string;
  nit: string;
  nrc: string;
  actividadEconomica: string;
  clasificacion: string;
  direccion: string;
  telefono: string;
  correo: string;
  esCliente: boolean;
  esProveedor: boolean;
  diasCredito: string;
}

const valoresDe = (rol: RolTercero, t?: TerceroVista): Valores => ({
  nombre: t?.nombre ?? "",
  nit: t?.nit ?? "",
  nrc: t?.nrc ?? "",
  actividadEconomica: t?.actividadEconomica ?? "",
  clasificacion: t?.clasificacion ?? "otro",
  direccion: t?.direccion ?? "",
  telefono: t?.telefono ?? "",
  correo: t?.correo ?? "",
  esCliente: t?.esCliente ?? rol === "cliente",
  esProveedor: t?.esProveedor ?? rol === "proveedor",
  diasCredito: String(t?.diasCredito ?? 0),
});

/** Solo los campos que cambiaron, para el PATCH; un texto opcional vacío se envía como null. */
function cambiosDe(actual: Valores, inicial: Valores): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  for (const campo of Object.keys(actual) as (keyof Valores)[]) {
    const valor = actual[campo];
    const previo = inicial[campo];
    if (valor === previo || (typeof valor === "string" && valor.trim() === String(previo).trim())) continue;
    cambios[campo] = valor === "" ? null : valor;
  }
  return cambios;
}

interface Props {
  empresaId: string;
  /** Registro que se edita; sin él se crea uno del tipo de la pestaña activa */
  tercero?: TerceroVista;
  rol: RolTercero;
  abierto: boolean;
  onCerrar: () => void;
}

/** Diálogo para registrar o editar un cliente o proveedor (HU-58, S3-T59). */
export function FormularioTercero(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, tercero, rol, onCerrar }: Props) {
  const inicial = valoresDe(rol, tercero);
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const crear = useCrearTercero(empresaId);
  const editar = useEditarTercero(empresaId);
  const guardando = crear.isPending || editar.isPending;
  const errorApi = crear.error ?? editar.error;

  const cambiar = <K extends keyof Valores>(campo: K, valor: Valores[K]) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores(({ [campo]: _quitado, ...resto }) => resto);
  };
  const alFallar = (error: Error) => {
    if (error instanceof ErrorApi) setErrores(error.errores);
  };

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    crear.reset();
    editar.reset();

    if (!tercero) {
      const r = validarFormulario(crearTerceroSchema, valores);
      if (!r.ok) return setErrores(r.errores);
      crear.mutate(r.datos, {
        onSuccess: (guardado) => {
          toast.success(T.creado(guardado.nombre));
          onCerrar();
        },
        onError: alFallar,
      });
      return;
    }

    const cambios = cambiosDe(valores, inicial);
    if (Object.keys(cambios).length === 0) return setErrores({ _formulario: [T.sinCambios] });
    const r = validarFormulario(editarTerceroSchema, cambios);
    if (!r.ok) return setErrores(r.errores);
    editar.mutate(
      { id: tercero.id, cambios: r.datos as EditarTercero },
      {
        onSuccess: () => {
          toast.success(T.actualizado);
          onCerrar();
        },
        onError: alFallar,
      },
    );
  }

  const error = (campo: keyof Valores) => errores[campo]?.[0];
  const aviso =
    errores._formulario?.[0] ??
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{tercero ? T.tituloEditar : T.tituloNuevo(rol)}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <Campo id="tercero-nombre" etiqueta={T.nombre} error={error("nombre")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={200}
            autoFocus
            value={valores.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
          />
        )}
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="tercero-nit" etiqueta={T.nit} error={error("nit")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              maxLength={17}
              placeholder={T.nitEjemplo}
              value={valores.nit}
              onChange={(e) => cambiar("nit", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="tercero-nrc" etiqueta={T.nrc} ayuda={T.nrcAyuda} error={error("nrc")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              maxLength={10}
              placeholder={T.nrcEjemplo}
              value={valores.nrc}
              onChange={(e) => cambiar("nrc", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <Campo id="tercero-actividad" etiqueta={T.actividad} error={error("actividadEconomica")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={200}
            value={valores.actividadEconomica}
            onChange={(e) => cambiar("actividadEconomica", e.target.value)}
          />
        )}
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          id="tercero-clasificacion"
          etiqueta={T.clasificacion}
          ayuda={T.clasificacionAyuda}
          error={error("clasificacion")}
        >
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.clasificacion}
              onChange={(e) => cambiar("clasificacion", e.target.value)}
            >
              <option value="grande">{TEXTOS_TERCEROS.clasificacion.grande}</option>
              <option value="mediano">{TEXTOS_TERCEROS.clasificacion.mediano}</option>
              <option value="otro">{TEXTOS_TERCEROS.clasificacion.otro}</option>
            </NativeSelect>
          )}
        </Campo>
        <Campo
          id="tercero-dias"
          etiqueta={T.diasCredito}
          ayuda={T.diasCreditoAyuda}
          error={error("diasCredito")}
        >
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              inputMode="numeric"
              value={valores.diasCredito}
              onChange={(e) => cambiar("diasCredito", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="tercero-telefono" etiqueta={T.telefono} error={error("telefono")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={20}
              value={valores.telefono}
              onChange={(e) => cambiar("telefono", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="tercero-correo" etiqueta={T.correo} error={error("correo")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              type="email"
              maxLength={150}
              value={valores.correo}
              onChange={(e) => cambiar("correo", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <Campo id="tercero-direccion" etiqueta={T.direccion} error={error("direccion")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={300}
            value={valores.direccion}
            onChange={(e) => cambiar("direccion", e.target.value)}
          />
        )}
      </Campo>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{T.rolEtiqueta}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={valores.esCliente}
            onChange={(e) => cambiar("esCliente", e.target.checked)}
          />
          {T.esCliente}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={valores.esProveedor}
            onChange={(e) => cambiar("esProveedor", e.target.checked)}
          />
          {T.esProveedor}
        </label>
        {error("esCliente") && (
          <p role="alert" className="text-sm text-destructive">
            {error("esCliente")}
          </p>
        )}
      </fieldset>
      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={guardando}>
          {guardando && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {guardando ? T.guardando : T.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
