import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  crearProductoSchema,
  editarProductoSchema,
  type CategoriaProducto,
  type EditarProducto,
  type ProductoVista,
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
import { useCrearProducto, useEditarProducto } from "./productos-api";
import { TEXTOS_PRODUCTOS } from "./textos";

const T = TEXTOS_PRODUCTOS.formulario;

interface Valores {
  codigo: string;
  nombre: string;
  categoriaId: string;
  unidadMedida: string;
  precioVenta: string;
}

const valoresDe = (p?: ProductoVista): Valores => ({
  codigo: p?.codigo ?? "",
  nombre: p?.nombre ?? "",
  categoriaId: p?.categoriaId ?? "",
  unidadMedida: p?.unidadMedida ?? "unidad",
  precioVenta: p?.precioVenta ?? "0.00",
});

/** Solo los campos que cambiaron, para el PATCH; quitar la categoría se envía como null. */
function cambiosDe(actual: Valores, inicial: Valores): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  for (const campo of Object.keys(actual) as (keyof Valores)[]) {
    if (actual[campo].trim() === inicial[campo].trim()) continue;
    cambios[campo] = campo === "categoriaId" && actual[campo] === "" ? null : actual[campo];
  }
  return cambios;
}

interface FormularioProductoProps {
  empresaId: string;
  /** Producto que se edita; sin él se registra uno nuevo */
  producto?: ProductoVista;
  categorias: readonly CategoriaProducto[];
  abierto: boolean;
  onCerrar: () => void;
}

/** Diálogo para registrar o editar un producto (HU-64, S3-T77). */
export function FormularioProducto(props: FormularioProductoProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, producto, categorias, onCerrar }: FormularioProductoProps) {
  const inicial = valoresDe(producto);
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const crear = useCrearProducto(empresaId);
  const editar = useEditarProducto(empresaId);
  const guardando = crear.isPending || editar.isPending;
  const errorApi = crear.error ?? editar.error;
  // Una categoría inactiva solo se ofrece si el producto ya la tiene
  const opciones = categorias.filter((c) => c.activa || c.id === producto?.categoriaId);

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

    if (!producto) {
      const r = validarFormulario(crearProductoSchema, valores);
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
    const r = validarFormulario(editarProductoSchema, cambios);
    if (!r.ok) return setErrores(r.errores);
    editar.mutate(
      { id: producto.id, cambios: r.datos as EditarProducto },
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
        <DialogTitle>{producto ? T.tituloEditar : T.tituloNuevo}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="producto-codigo" etiqueta={T.codigo} ayuda={T.codigoAyuda} error={error("codigo")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 uppercase tabular-nums"
              maxLength={30}
              autoComplete="off"
              autoFocus
              value={valores.codigo}
              onChange={(e) => cambiar("codigo", e.target.value.toUpperCase())}
            />
          )}
        </Campo>
        <Campo id="producto-unidad" etiqueta={T.unidad} error={error("unidadMedida")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={20}
              placeholder={T.unidadEjemplo}
              value={valores.unidadMedida}
              onChange={(e) => cambiar("unidadMedida", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <Campo id="producto-nombre" etiqueta={T.nombre} error={error("nombre")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={150}
            value={valores.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
          />
        )}
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="producto-categoria" etiqueta={T.categoria} error={error("categoriaId")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.categoriaId}
              onChange={(e) => cambiar("categoriaId", e.target.value)}
            >
              <option value="">{T.sinCategoria}</option>
              {opciones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id="producto-precio" etiqueta={T.precio} error={error("precioVenta")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              inputMode="decimal"
              value={valores.precioVenta}
              onChange={(e) => cambiar("precioVenta", e.target.value)}
            />
          )}
        </Campo>
      </div>
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
