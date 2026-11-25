import { useState, type FormEvent } from "react";
import { Power } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { crearCategoriaSchema, type CategoriaProducto } from "@contable/shared";
import { Campo } from "@/components/campo";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { validarFormulario } from "@/lib/validacion";
import { useCrearCategoria, useEditarCategoria } from "./productos-api";
import { TEXTOS_PRODUCTOS } from "./textos";

const T = TEXTOS_PRODUCTOS.categoriasDialogo;

interface Props {
  empresaId: string;
  categorias: readonly CategoriaProducto[];
  puedeRegistrar: boolean;
  abierto: boolean;
  onCerrar: () => void;
}

/** Lista las categorías de producto y permite agregar o inactivar (HU-64, S3-T77). */
export function DialogoCategorias({ empresaId, categorias, puedeRegistrar, abierto, onCerrar }: Props) {
  const [nombre, setNombre] = useState("");
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const crear = useCrearCategoria(empresaId);
  const editar = useEditarCategoria(empresaId);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (crear.isPending) return;
    crear.reset();
    const r = validarFormulario(crearCategoriaSchema, { nombre });
    if (!r.ok) return setErrores(r.errores);
    crear.mutate(r.datos, {
      onSuccess: (c) => {
        toast.success(T.creada(c.nombre));
        setNombre("");
        setErrores({});
      },
      onError: (e) => e instanceof ErrorApi && setErrores(e.errores),
    });
  }

  const errorApi = crear.error ?? editar.error;
  const aviso =
    errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined;

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{T.titulo}</DialogTitle>
          <DialogDescription>{T.descripcion}</DialogDescription>
        </DialogHeader>

        {categorias.length === 0 ? (
          <p className="text-sm text-muted-foreground">{T.vacio}</p>
        ) : (
          <ul aria-label={T.titulo} className="grid max-h-64 gap-1 overflow-y-auto">
            {categorias.map((c) => (
              <li
                key={c.id}
                className={cn("flex items-center gap-3 rounded-xl px-3 py-2", !c.activa && "opacity-60")}
              >
                <span className="flex-1 font-medium">{c.nombre}</span>
                {!c.activa && <Badge variant="neutra">{T.inactiva}</Badge>}
                <span className="text-xs text-muted-foreground">{T.productos(c.productos)}</span>
                {puedeRegistrar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-muted-foreground"
                    aria-label={c.activa ? T.inactivar(c.nombre) : T.activar(c.nombre)}
                    disabled={editar.isPending}
                    onClick={() => editar.mutate({ id: c.id, cambios: { activa: !c.activa } })}
                  >
                    <Power aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {puedeRegistrar && (
          <form noValidate onSubmit={alEnviar} className="flex items-end gap-2">
            <Campo
              id="categoria-nombre"
              etiqueta={T.nombre}
              error={errores["nombre"]?.[0]}
              className="flex-1"
            >
              {(p) => (
                <Input
                  {...p}
                  className="h-10"
                  maxLength={80}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              )}
            </Campo>
            <Button type="submit" disabled={crear.isPending} className="h-10">
              {crear.isPending ? T.agregando : T.agregar}
            </Button>
          </form>
        )}
        {aviso && <Alert variant="error">{aviso}</Alert>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            {T.cerrar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
