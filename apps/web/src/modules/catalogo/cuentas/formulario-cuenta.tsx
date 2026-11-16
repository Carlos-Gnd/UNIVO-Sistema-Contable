import { useMemo, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  crearCuentaSchema,
  editarCuentaSchema,
  naturalezaSchema,
  tipoCuentaSchema,
  type CrearCuentaEntrada,
  type EditarCuenta,
  type Naturaleza,
  type TipoCuenta,
} from "@contable/shared";
import { Campo } from "@/components/campo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useCrearCuenta, useEditarCuenta } from "./cuentas-api";
import {
  ETIQUETAS_NATURALEZA,
  ETIQUETAS_TIPO_CUENTA,
  LONGITUDES_CODIGO_CUENTA,
  type CuentaCatalogo,
} from "./tipos";
import { TEXTOS_FORMULARIO_CUENTA as T } from "./textos";

interface FormularioCuentaProps {
  empresaId: string;
  abierto: boolean;
  cuentas: readonly CuentaCatalogo[];
  cuenta?: CuentaCatalogo;
  onCerrar: () => void;
  onGuardado: (cuenta: CuentaCatalogo, creada: boolean) => void;
}

function siguienteLongitud(longitudPadre: number | undefined): number {
  if (longitudPadre === undefined) return 1;
  return LONGITUDES_CODIGO_CUENTA.find((longitud) => longitud > longitudPadre) ?? 11;
}

/** Formulario reutilizable para crear o editar una cuenta del catálogo (S1-T63, HU-15). */
export function FormularioCuenta(props: FormularioCuentaProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        {props.abierto && <ContenidoFormulario {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ContenidoFormulario({ empresaId, cuentas, cuenta, onCerrar, onGuardado }: FormularioCuentaProps) {
  const esEdicion = cuenta !== undefined;
  const [codigo, setCodigo] = useState(cuenta?.codigo ?? "");
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [cuentaPadreId, setCuentaPadreId] = useState(cuenta?.cuentaPadreId ?? "");
  const padre = useMemo(
    () => cuentas.find((candidata) => candidata.id === cuentaPadreId),
    [cuentas, cuentaPadreId],
  );
  const [naturaleza, setNaturaleza] = useState<Naturaleza>(
    cuenta?.naturaleza ?? padre?.naturaleza ?? "deudora",
  );
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta?.tipo ?? padre?.tipo ?? "activo");
  const [activa, setActiva] = useState(cuenta?.activa ?? true);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [errorGeneral, setErrorGeneral] = useState<string>();
  const crear = useCrearCuenta(empresaId);
  const editar = useEditarCuenta(empresaId, cuenta?.id ?? "");
  const guardar = esEdicion ? editar : crear;

  const padresDisponibles = useMemo(
    () =>
      cuentas.filter(
        (candidata) =>
          candidata.activa && candidata.id !== cuenta?.id && siguienteLongitud(candidata.codigo.length) < 11,
      ),
    [cuentas, cuenta?.id],
  );
  const digitosCodigo = siguienteLongitud(padre?.codigo.length);

  function cambiarPadre(id: string) {
    setCuentaPadreId(id);
    const nuevoPadre = cuentas.find((candidata) => candidata.id === id);
    setNaturaleza(nuevoPadre?.naturaleza ?? "deudora");
    setTipo(nuevoPadre?.tipo ?? "activo");
    setCodigo(nuevoPadre?.codigo ?? "");
    setErrores({});
    setErrorGeneral(undefined);
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardar.isPending) return;
    setErrores({});
    setErrorGeneral(undefined);

    const codigoLimpio = codigo.replace(/\D/g, "");
    const codigoPadre = padre?.codigo;
    if (
      codigoLimpio.length !== digitosCodigo ||
      (codigoPadre !== undefined && !codigoLimpio.startsWith(codigoPadre))
    ) {
      setErrores({ codigo: [T.codigoInvalido] });
      return;
    }

    const datos = { codigo: codigoLimpio, nombre, naturaleza, tipo, activa };
    const resultado = validarFormulario(esEdicion ? editarCuentaSchema : crearCuentaSchema, datos);
    if (!resultado.ok) {
      setErrores(resultado.errores);
      return;
    }

    if (esEdicion) {
      editar.mutate(resultado.datos as EditarCuenta, {
        onSuccess: (guardada) => {
          toast.success(T.editar.exito);
          onGuardado(guardada, false);
        },
        onError: (error) => {
          if (error instanceof ErrorApi) setErrores(error.errores);
          setErrorGeneral(error instanceof ErrorApi ? error.message : mensajeDeError(error));
        },
      });
    } else {
      crear.mutate(resultado.datos as CrearCuentaEntrada, {
        onSuccess: (guardada) => {
          toast.success(T.nueva.exito(guardada.codigo));
          onGuardado(guardada, true);
        },
        onError: (error) => {
          if (error instanceof ErrorApi) setErrores(error.errores);
          setErrorGeneral(error instanceof ErrorApi ? error.message : mensajeDeError(error));
        },
      });
    }
  }

  const textos = esEdicion ? T.editar : T.nueva;

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{textos.titulo}</DialogTitle>
        <DialogDescription>{textos.descripcion}</DialogDescription>
      </DialogHeader>

      {!esEdicion && (
        <Campo id="cuenta-padre" etiqueta={T.padre} ayuda={T.padreAyuda}>
          {({ id, ...accesibilidad }) => (
            <NativeSelect
              id={id}
              {...accesibilidad}
              value={cuentaPadreId}
              onChange={(evento) => cambiarPadre(evento.currentTarget.value)}
            >
              <option value="">{T.sinPadre}</option>
              {padresDisponibles.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.codigo} · {opcion.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
      )}

      <Campo
        id="cuenta-codigo"
        etiqueta={T.codigo}
        ayuda={padre ? T.codigoAyudaConPadre(padre.codigo, digitosCodigo) : T.codigoAyuda}
        error={errores.codigo?.[0]}
      >
        {(props) => (
          <Input
            {...props}
            autoFocus
            inputMode="numeric"
            maxLength={digitosCodigo}
            value={codigo}
            onChange={(evento) => {
              setCodigo(evento.currentTarget.value.replace(/\D/g, "").slice(0, digitosCodigo));
              setErrores((actuales) => ({ ...actuales, codigo: undefined }));
            }}
          />
        )}
      </Campo>

      <Campo id="cuenta-nombre" etiqueta={T.nombre} error={errores.nombre?.[0]}>
        {(props) => (
          <Input
            {...props}
            placeholder={T.nombrePlaceholder}
            maxLength={200}
            value={nombre}
            onChange={(evento) => {
              setNombre(evento.currentTarget.value);
              setErrores((actuales) => ({ ...actuales, nombre: undefined }));
            }}
          />
        )}
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="cuenta-naturaleza" etiqueta={T.naturaleza} error={errores.naturaleza?.[0]}>
          {({ id, ...accesibilidad }) => (
            <NativeSelect
              id={id}
              {...accesibilidad}
              value={naturaleza}
              disabled={!esEdicion && Boolean(padre)}
              onChange={(evento) => {
                setNaturaleza(naturalezaSchema.parse(evento.currentTarget.value));
                setErrores((actuales) => ({ ...actuales, naturaleza: undefined }));
              }}
            >
              {naturalezaSchema.options.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {ETIQUETAS_NATURALEZA[opcion]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id="cuenta-tipo" etiqueta={T.tipo} error={errores.tipo?.[0]}>
          {({ id, ...accesibilidad }) => (
            <NativeSelect
              id={id}
              {...accesibilidad}
              value={tipo}
              disabled={!esEdicion && Boolean(padre)}
              onChange={(evento) => {
                setTipo(tipoCuentaSchema.parse(evento.currentTarget.value));
                setErrores((actuales) => ({ ...actuales, tipo: undefined }));
              }}
            >
              {tipoCuentaSchema.options.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {ETIQUETAS_TIPO_CUENTA[opcion]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
      </div>

      <Campo id="cuenta-activa" etiqueta={T.activa} ayuda={T.activaAyuda}>
        {({ id, ...accesibilidad }) => (
          <Checkbox
            id={id}
            {...accesibilidad}
            checked={activa}
            onChange={(evento) => {
              setActiva(evento.currentTarget.checked);
              setErrores((actuales) => ({ ...actuales, activa: undefined }));
            }}
          />
        )}
      </Campo>

      {errorGeneral && <Alert variant="error">{errorGeneral}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={guardar.isPending}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {guardar.isPending ? textos.guardando : textos.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
