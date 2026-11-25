import { useMemo, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  crearCuentaTesoreriaSchema,
  editarCuentaTesoreriaSchema,
  type CuentaTesoreriaVista,
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
import { NativeSelect } from "@/components/ui/native-select";
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { validarFormulario } from "@/lib/validacion";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import { usePermisos } from "@/modules/organizacion/permisos";
import { cuentasDeEfectivoLibres } from "./cuentas-efectivo";
import { useCrearCuentaTesoreria, useEditarCuentaTesoreria } from "./cuentas-tesoreria-api";
import { TEXTOS_CUENTAS_TESORERIA } from "./textos";

const T = TEXTOS_CUENTAS_TESORERIA.formulario;

interface Valores {
  tipo: string;
  nombre: string;
  cuentaId: string;
  sucursalId: string;
  banco: string;
  numeroCuenta: string;
}

const valoresDe = (c?: CuentaTesoreriaVista): Valores => ({
  tipo: c?.tipo ?? "caja",
  nombre: c?.nombre ?? "",
  cuentaId: c?.cuentaId ?? "",
  sucursalId: c?.sucursalId ?? "",
  banco: c?.banco ?? "",
  numeroCuenta: c?.numeroCuenta ?? "",
});

interface Props {
  empresaId: string;
  /** Caja o cuenta que se edita; sin ella se registra una nueva */
  cuenta?: CuentaTesoreriaVista;
  catalogo: readonly CuentaCatalogo[];
  /** Cuentas contables que ya tienen caja o banco */
  cuentasUsadas: ReadonlySet<string>;
  sucursales: readonly SucursalDetalle[];
  abierto: boolean;
  onCerrar: () => void;
}

/** Diálogo para registrar o editar una caja o cuenta bancaria (HU-76, S3-T113). */
export function FormularioCuentaTesoreria(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(a) => !a && props.onCerrar()}>
      <DialogContent className="sm:max-w-lg">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, cuenta, catalogo, cuentasUsadas, sucursales, onCerrar }: Props) {
  const inicial = valoresDe(cuenta);
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const crear = useCrearCuentaTesoreria(empresaId);
  const editar = useEditarCuentaTesoreria(empresaId);
  const guardando = crear.isPending || editar.isPending;
  const errorApi = crear.error ?? editar.error;
  const { todasSucursales, sucursales: asignadas } = usePermisos();
  const libres = useMemo(() => cuentasDeEfectivoLibres(catalogo, cuentasUsadas), [catalogo, cuentasUsadas]);
  // Quien ve algunas sucursales solo registra cajas de las suyas; la empresa completa es de quien las ve todas
  const sucursalesPermitidas = sucursales.filter(
    (s) => s.activa && (todasSucursales || asignadas.includes(s.id)),
  );
  const esBanco = valores.tipo === "banco";

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

    if (!cuenta) {
      const r = validarFormulario(crearCuentaTesoreriaSchema, {
        ...valores,
        banco: esBanco ? valores.banco : "",
        numeroCuenta: esBanco ? valores.numeroCuenta : "",
      });
      if (!r.ok) return setErrores(r.errores);
      crear.mutate(r.datos, {
        onSuccess: (c) => {
          toast.success(T.creada(c.nombre));
          onCerrar();
        },
        onError: alFallar,
      });
      return;
    }

    const cambios: Record<string, unknown> = {};
    if (valores.nombre.trim() !== inicial.nombre) cambios["nombre"] = valores.nombre;
    if (esBanco && valores.banco.trim() !== inicial.banco) cambios["banco"] = valores.banco;
    if (esBanco && valores.numeroCuenta.trim() !== inicial.numeroCuenta)
      cambios["numeroCuenta"] = valores.numeroCuenta;
    if (valores.sucursalId !== inicial.sucursalId)
      cambios["sucursalId"] = valores.sucursalId === "" ? null : valores.sucursalId;
    if (Object.keys(cambios).length === 0) return setErrores({ _formulario: [T.sinCambios] });
    const r = validarFormulario(editarCuentaTesoreriaSchema, cambios);
    if (!r.ok) return setErrores(r.errores);
    editar.mutate(
      { id: cuenta.id, cambios: r.datos },
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
  const aviso =
    errores._formulario?.[0] ??
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{cuenta ? T.tituloEditar : T.tituloNueva}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
        <Campo id="tesoreria-tipo" etiqueta={T.tipo} error={error("tipo")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.tipo}
              disabled={Boolean(cuenta)}
              onChange={(e) => cambiar("tipo", e.target.value)}
            >
              <option value="caja">{TEXTOS_CUENTAS_TESORERIA.tipo.caja}</option>
              <option value="banco">{TEXTOS_CUENTAS_TESORERIA.tipo.banco}</option>
            </NativeSelect>
          )}
        </Campo>
        <Campo id="tesoreria-nombre" etiqueta={T.nombre} error={error("nombre")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={100}
              autoFocus
              placeholder={T.nombreEjemplo}
              value={valores.nombre}
              onChange={(e) => cambiar("nombre", e.target.value)}
            />
          )}
        </Campo>
      </div>

      {cuenta ? (
        <Alert>
          {`${cuenta.cuentaCodigo} ${cuenta.cuentaNombre}. `}
          {T.cuentaFija}
        </Alert>
      ) : (
        <Campo
          id="tesoreria-cuenta"
          etiqueta={T.cuentaContable}
          ayuda={libres.length === 0 ? T.sinCuentas : undefined}
          error={error("cuentaId")}
        >
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.cuentaId}
              onChange={(e) => cambiar("cuentaId", e.target.value)}
            >
              <option value="">{T.elegirCuenta}</option>
              {libres.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.codigo} ${c.nombre}`}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
      )}

      {esBanco && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="tesoreria-banco" etiqueta={T.banco} error={error("banco")}>
            {(p) => (
              <Input
                {...p}
                className="h-10"
                maxLength={80}
                value={valores.banco}
                onChange={(e) => cambiar("banco", e.target.value)}
              />
            )}
          </Campo>
          <Campo id="tesoreria-numero" etiqueta={T.numeroCuenta} error={error("numeroCuenta")}>
            {(p) => (
              <Input
                {...p}
                className="h-10 tabular-nums"
                maxLength={40}
                value={valores.numeroCuenta}
                onChange={(e) => cambiar("numeroCuenta", e.target.value)}
              />
            )}
          </Campo>
        </div>
      )}

      <Campo
        id="tesoreria-sucursal"
        etiqueta={T.sucursal}
        ayuda={T.sucursalAyuda}
        error={error("sucursalId")}
      >
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={valores.sucursalId}
            onChange={(e) => cambiar("sucursalId", e.target.value)}
          >
            {todasSucursales && <option value="">{TEXTOS_CUENTAS_TESORERIA.toda}</option>}
            {sucursalesPermitidas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
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
