import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { asignarRolUsuarioSchema, type MiembroEmpresa, type SucursalDetalle } from "@contable/shared";
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
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { validarFormulario } from "@/lib/validacion";
import { CamposRolSucursales } from "./campos-rol-sucursales";
import { datosRol, type ValoresRol } from "./rol-sucursales";
import { useAsignarRol } from "./usuarios-api";

interface DialogoAsignarRolProps {
  empresaId: string;
  /** Usuario al que se le cambia el rol; null cierra el diálogo */
  miembro: MiembroEmpresa | null;
  /** El usuario con sesión: se le avisa que puede perder el acceso */
  esPropio: boolean;
  sucursales: readonly SucursalDetalle[];
  onCerrar: () => void;
}

const mismos = (a: ValoresRol, b: ValoresRol) =>
  a.rol === b.rol &&
  a.sucursales.length === b.sucursales.length &&
  a.sucursales.every((s) => b.sucursales.includes(s));

/** Diálogo de asignación de rol y sucursales de un usuario de la empresa (S1-T49, HU-08). */
export function DialogoAsignarRol(props: DialogoAsignarRolProps) {
  return (
    <Dialog open={props.miembro !== null} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-xl">
        {props.miembro && <Contenido {...props} miembro={props.miembro} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({
  empresaId,
  miembro,
  esPropio,
  sucursales,
  onCerrar,
}: DialogoAsignarRolProps & { miembro: MiembroEmpresa }) {
  const { t } = useTranslation("usuarios");
  const inicial: ValoresRol = { rol: miembro.rol, sucursales: miembro.sucursales };
  const [valores, setValores] = useState<ValoresRol>(inicial);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const asignar = useAsignarRol(empresaId);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (asignar.isPending) return;
    asignar.reset();
    const datos = datosRol(valores);
    if (mismos(datos, datosRol(inicial))) return setErrores({ _formulario: [t("asignacion.sinCambios")] });
    const r = validarFormulario(asignarRolUsuarioSchema, datos);
    if (!r.ok) return setErrores(r.errores);
    setErrores({});
    asignar.mutate(
      { usuarioId: miembro.usuarioId, datos: r.datos },
      {
        onSuccess: () => {
          toast.success(t("asignacion.guardado", { nombre: miembro.nombre }));
          onCerrar();
        },
        onError: (error) => error instanceof ErrorApi && setErrores(error.errores),
      },
    );
  }

  const errorApi = asignar.error;
  const aviso =
    errores._formulario?.[0] ??
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("asignacion.titulo")}</DialogTitle>
        <DialogDescription>
          {miembro.nombre} · {miembro.correo}. {t("asignacion.descripcion")}
        </DialogDescription>
      </DialogHeader>

      <CamposRolSucursales
        id="asignar"
        valores={valores}
        sucursales={sucursales}
        deshabilitado={asignar.isPending}
        errorRol={errores.rol?.[0]}
        errorSucursales={errores.sucursales?.[0]}
        onCambiar={(nuevos) => {
          setValores(nuevos);
          setErrores({});
        }}
      />

      {esPropio && valores.rol !== "administrador" && <Alert>{t("asignacion.propio")}</Alert>}
      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={asignar.isPending}>
          {t("asignacion.cancelar")}
        </Button>
        <Button type="submit" disabled={asignar.isPending}>
          {asignar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {asignar.isPending ? t("asignacion.guardando") : t("asignacion.guardar")}
        </Button>
      </DialogFooter>
    </form>
  );
}
