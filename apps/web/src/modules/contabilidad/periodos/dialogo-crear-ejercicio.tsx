import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { crearEjercicioSchema } from "@contable/shared";
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
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { validarFormulario } from "@/lib/validacion";
import { ejercicioDelAnio, useCrearEjercicio } from "./periodos-api";
import { MESES, TEXTOS_PERIODOS } from "./textos";

const T = TEXTOS_PERIODOS.dialogo;
/** Mismo rango que crearEjercicioSchema */
const ANIO_MINIMO = 2000;
const ANIO_MAXIMO = 2100;

interface DialogoCrearEjercicioProps {
  empresaId: string;
  abierto: boolean;
  /** Año que se propone: el siguiente al último ejercicio o el año en curso */
  anioSugerido: number;
  aniosExistentes: readonly number[];
  onCerrar: () => void;
  onCreado: (anio: number) => void;
}

/** Crear un ejercicio con sus doce períodos mensuales (S1-T75). */
export function DialogoCrearEjercicio(props: DialogoCrearEjercicioProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-md">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({
  empresaId,
  anioSugerido,
  aniosExistentes,
  onCerrar,
  onCreado,
}: DialogoCrearEjercicioProps) {
  const [anio, setAnio] = useState(String(anioSugerido));
  const [error, setError] = useState<string>();
  const crear = useCrearEjercicio(empresaId);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (crear.isPending) return;
    crear.reset();
    const numero = Number(anio);
    // El esquema compartido no trae mensajes propios para el año: se explica el rango aquí
    if (!/^\d{4}$/.test(anio) || numero < ANIO_MINIMO || numero > ANIO_MAXIMO)
      return setError(T.anioInvalido);
    if (aniosExistentes.includes(numero)) return setError(T.anioExiste(numero));
    const r = validarFormulario(crearEjercicioSchema, ejercicioDelAnio(numero));
    if (!r.ok) return setError(T.anioInvalido);
    crear.mutate(r.datos, {
      onSuccess: (creado) => {
        toast.success(T.creado(creado.anio));
        onCreado(creado.anio);
      },
      onError: (e) => setError(e instanceof ErrorApi ? (e.errorDe("anio") ?? e.message) : mensajeDeError(e)),
    });
  }

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>
      <Campo id="ejercicio-anio" etiqueta={T.anio} ayuda={T.anioAyuda} error={error}>
        {(p) => (
          <Input
            {...p}
            autoFocus
            className="h-10 tabular-nums"
            inputMode="numeric"
            maxLength={4}
            value={anio}
            onChange={(e) => {
              setAnio(e.target.value.replace(/\D/g, ""));
              setError(undefined);
            }}
          />
        )}
      </Campo>
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{T.meses}</p>
        <ul className="grid grid-cols-4 gap-1.5 text-xs" aria-label={T.meses}>
          {MESES.map((m) => (
            <li
              key={m}
              className="grid h-8 place-items-center rounded-lg bg-background text-muted-foreground"
            >
              {m.slice(0, 3)}
            </li>
          ))}
        </ul>
      </div>
      {crear.isError && !error && <Alert variant="error">{mensajeDeError(crear.error)}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={crear.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={crear.isPending}>
          {crear.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {crear.isPending ? T.creando : T.crear(anio)}
        </Button>
      </DialogFooter>
    </form>
  );
}
