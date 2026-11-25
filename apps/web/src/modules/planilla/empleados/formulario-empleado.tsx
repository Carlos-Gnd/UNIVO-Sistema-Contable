import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  crearEmpleadoSchema,
  editarEmpleadoSchema,
  type EditarEmpleado,
  type EmpleadoVista,
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
import { useCrearEmpleado, useEditarEmpleado } from "./empleados-api";
import { TEXTOS_EMPLEADOS as T } from "./textos";

interface Valores {
  nombres: string;
  apellidos: string;
  dui: string;
  nit: string;
  numeroIsss: string;
  nup: string;
  puesto: string;
  area: string;
  salario: string;
  fechaIngreso: string;
  sucursalId: string;
}

const valoresDe = (e?: EmpleadoVista): Valores => ({
  nombres: e?.nombres ?? "",
  apellidos: e?.apellidos ?? "",
  dui: e?.dui ?? "",
  nit: e?.nit ?? "",
  numeroIsss: e?.numeroIsss ?? "",
  nup: e?.nup ?? "",
  puesto: e?.puesto ?? "",
  area: e?.area ?? "",
  salario: e?.salario ?? "",
  fechaIngreso: e?.fechaIngreso ?? "",
  sucursalId: e?.sucursalId ?? "",
});

function cambiosDe(actual: Valores, inicial: Valores): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  for (const campo of Object.keys(actual) as (keyof Valores)[]) {
    if (actual[campo].trim() === inicial[campo].trim()) continue;
    cambios[campo] = campo === "area" && actual[campo] === "" ? null : actual[campo];
  }
  return cambios;
}

interface FormularioEmpleadoProps {
  empresaId: string;
  empleado?: EmpleadoVista;
  sucursales: readonly SucursalDetalle[];
  cargandoSucursales: boolean;
  abierto: boolean;
  onCerrar: () => void;
}

export function FormularioEmpleado(props: FormularioEmpleadoProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-2xl">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({
  empresaId,
  empleado,
  sucursales,
  cargandoSucursales,
  onCerrar,
}: FormularioEmpleadoProps) {
  const inicial = valoresDe(empleado);
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const crear = useCrearEmpleado(empresaId);
  const editar = useEditarEmpleado(empresaId);
  const guardando = crear.isPending || editar.isPending;
  const errorApi = crear.error ?? editar.error;
  const opciones = sucursales.filter((s) => s.activa || s.id === empleado?.sucursalId);

  function cambiar(campo: keyof Valores, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores(({ [campo]: _quitado, ...resto }) => resto);
  }

  function alFallar(error: Error) {
    if (error instanceof ErrorApi) setErrores(error.errores);
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    crear.reset();
    editar.reset();

    if (!empleado) {
      const r = validarFormulario(crearEmpleadoSchema, valores);
      if (!r.ok) return setErrores(r.errores);
      crear.mutate(r.datos, {
        onSuccess: (guardado) => {
          toast.success(T.formulario.creado(guardado.dui));
          onCerrar();
        },
        onError: alFallar,
      });
      return;
    }

    const cambios = cambiosDe(valores, inicial);
    if (Object.keys(cambios).length === 0) return setErrores({ _formulario: [T.formulario.sinCambios] });
    const r = validarFormulario(editarEmpleadoSchema, cambios);
    if (!r.ok) return setErrores(r.errores);
    editar.mutate(
      { id: empleado.id, cambios: r.datos as EditarEmpleado },
      {
        onSuccess: () => {
          toast.success(T.formulario.actualizado);
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
        <DialogTitle>{empleado ? T.formulario.tituloEditar : T.formulario.tituloNuevo}</DialogTitle>
        <DialogDescription>{T.formulario.descripcion}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="empleado-nombres" etiqueta={T.formulario.nombres} error={error("nombres")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={100}
              value={valores.nombres}
              onChange={(e) => cambiar("nombres", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="empleado-apellidos" etiqueta={T.formulario.apellidos} error={error("apellidos")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={100}
              value={valores.apellidos}
              onChange={(e) => cambiar("apellidos", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="empleado-dui" etiqueta={T.formulario.dui} error={error("dui")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={20}
              value={valores.dui}
              onChange={(e) => cambiar("dui", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="empleado-nit" etiqueta={T.formulario.nit} error={error("nit")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={20}
              value={valores.nit}
              onChange={(e) => cambiar("nit", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="empleado-isss" etiqueta={T.formulario.isss} error={error("numeroIsss")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={20}
              value={valores.numeroIsss}
              onChange={(e) => cambiar("numeroIsss", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="empleado-nup" etiqueta={T.formulario.nup} error={error("nup")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={20}
              value={valores.nup}
              onChange={(e) => cambiar("nup", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="empleado-puesto" etiqueta={T.formulario.puesto} error={error("puesto")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={100}
              value={valores.puesto}
              onChange={(e) => cambiar("puesto", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="empleado-area" etiqueta={T.formulario.area} error={error("area")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={100}
              value={valores.area}
              onChange={(e) => cambiar("area", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo id="empleado-salario" etiqueta={T.formulario.salario} error={error("salario")}>
          {(p) => (
            <Input
              {...p}
              className="h-10 tabular-nums"
              inputMode="decimal"
              value={valores.salario}
              onChange={(e) => cambiar("salario", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="empleado-fecha-ingreso" etiqueta={T.formulario.ingreso} error={error("fechaIngreso")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              type="date"
              value={valores.fechaIngreso}
              onChange={(e) => cambiar("fechaIngreso", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="empleado-sucursal" etiqueta={T.formulario.sucursal} error={error("sucursalId")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              disabled={cargandoSucursales}
              value={valores.sucursalId}
              onChange={(e) => cambiar("sucursalId", e.target.value)}
            >
              <option value="">{T.formulario.seleccionarSucursal}</option>
              {opciones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
      </div>

      {aviso && <Alert variant="error">{aviso}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar}>
          {T.formulario.cancelar}
        </Button>
        <Button type="submit" disabled={guardando || cargandoSucursales}>
          {guardando && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {guardando ? T.formulario.guardando : T.formulario.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
