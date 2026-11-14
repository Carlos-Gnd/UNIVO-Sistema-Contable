import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  CODIGO_DTE_INICIAL,
  crearSucursalSchema,
  editarSucursalSchema,
  type EditarSucursalEntrada,
  type SucursalDetalle,
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
import { Textarea } from "@/components/ui/textarea";
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { validarFormulario } from "@/lib/validacion";
import { useCrearSucursal, useEditarSucursal } from "./sucursales-api";
import { TEXTOS_SUCURSALES } from "./textos";

const T = TEXTOS_SUCURSALES.formulario;

interface Valores {
  nombre: string;
  codigoEstablecimiento: string;
  codigoPuntoVenta: string;
  direccion: string;
}

const valoresDe = (s?: SucursalDetalle): Valores => ({
  nombre: s?.nombre ?? "",
  codigoEstablecimiento: s?.codigoEstablecimiento ?? "",
  codigoPuntoVenta: s?.codigoPuntoVenta ?? CODIGO_DTE_INICIAL,
  direccion: s?.direccion ?? "",
});

/** Solo los campos que cambiaron, para el PATCH. */
function cambiosDe(actual: Valores, inicial: Valores): EditarSucursalEntrada {
  const cambios: EditarSucursalEntrada = {};
  for (const campo of Object.keys(actual) as (keyof Valores)[]) {
    if (actual[campo].trim() !== inicial[campo].trim()) cambios[campo] = actual[campo];
  }
  return cambios;
}

interface FormularioSucursalProps {
  empresaId: string;
  /** Sucursal que se edita; sin ella se registra una nueva */
  sucursal?: SucursalDetalle;
  abierto: boolean;
  onCerrar: () => void;
}

/** Diálogo para registrar o editar una sucursal con sus códigos de Hacienda (S1-T45). */
export function FormularioSucursal(props: FormularioSucursalProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        {/* El contenido se monta al abrir: cada apertura empieza con los datos actuales */}
        {props.abierto && <Contenido {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, sucursal, onCerrar }: FormularioSucursalProps) {
  const inicial = valoresDe(sucursal);
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const crear = useCrearSucursal(empresaId);
  const editar = useEditarSucursal(empresaId);
  const guardando = crear.isPending || editar.isPending;
  const errorApi = crear.error ?? editar.error;

  const cambiar = (campo: keyof Valores, valor: string) => {
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

    if (!sucursal) {
      const r = validarFormulario(crearSucursalSchema, valores);
      if (!r.ok) return setErrores(r.errores);
      crear.mutate(r.datos, {
        onSuccess: (guardada) => {
          toast.success(T.creada(guardada.nombre));
          onCerrar();
        },
        onError: alFallar,
      });
      return;
    }

    const cambios = cambiosDe(valores, inicial);
    if (Object.keys(cambios).length === 0) return setErrores({ _formulario: [T.sinCambios] });
    const r = validarFormulario(editarSucursalSchema, cambios);
    if (!r.ok) return setErrores(r.errores);
    editar.mutate(
      { id: sucursal.id, cambios: r.datos },
      {
        onSuccess: () => {
          toast.success(T.actualizada);
          onCerrar();
        },
        onError: alFallar,
      },
    );
  }

  const error = (campo: keyof Valores) => errores[campo]?.[0];
  // Los errores de validación de la API (400) se ven en su campo; los demás, como aviso
  const aviso =
    errores._formulario?.[0] ??
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{sucursal ? T.tituloEditar : T.tituloNueva}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <Campo id="sucursal-nombre" etiqueta={T.nombre} error={error("nombre")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={150}
            autoFocus
            placeholder={T.nombreEjemplo}
            value={valores.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
          />
        )}
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          id="sucursal-establecimiento"
          etiqueta={T.codigoEstablecimiento}
          ayuda={T.codigoEstablecimientoAyuda}
          error={error("codigoEstablecimiento")}
        >
          {(p) => (
            <Input
              {...p}
              className="h-10 uppercase tabular-nums"
              maxLength={4}
              autoComplete="off"
              value={valores.codigoEstablecimiento}
              onChange={(e) => cambiar("codigoEstablecimiento", e.target.value.toUpperCase())}
            />
          )}
        </Campo>
        <Campo
          id="sucursal-punto-venta"
          etiqueta={T.codigoPuntoVenta}
          ayuda={T.codigoPuntoVentaAyuda}
          error={error("codigoPuntoVenta")}
        >
          {(p) => (
            <Input
              {...p}
              className="h-10 uppercase tabular-nums"
              maxLength={4}
              autoComplete="off"
              value={valores.codigoPuntoVenta}
              onChange={(e) => cambiar("codigoPuntoVenta", e.target.value.toUpperCase())}
            />
          )}
        </Campo>
      </div>
      <Campo
        id="sucursal-direccion"
        etiqueta={T.direccion}
        ayuda={T.direccionAyuda}
        error={error("direccion")}
      >
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            maxLength={300}
            value={valores.direccion}
            onChange={(e) => cambiar("direccion", e.target.value)}
          />
        )}
      </Campo>
      {sucursal && <Alert>{T.avisoCodigos}</Alert>}
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
