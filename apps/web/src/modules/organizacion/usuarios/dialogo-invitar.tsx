import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { invitarUsuarioSchema, type SucursalDetalle } from "@contable/shared";
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
import { validarFormulario } from "@/lib/validacion";
import { CamposRolSucursales } from "./campos-rol-sucursales";
import { datosRol, type ValoresRol } from "./rol-sucursales";
import { useInvitarUsuario } from "./usuarios-api";

interface DialogoInvitarProps {
  empresaId: string;
  abierto: boolean;
  sucursales: readonly SucursalDetalle[];
  onCerrar: () => void;
}

/** Diálogo para invitar a un usuario por correo con su rol y sucursales (S1-T48, HU-08). */
export function DialogoInvitar(props: DialogoInvitarProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-xl">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, sucursales, onCerrar }: DialogoInvitarProps) {
  const { t } = useTranslation("usuarios");
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<ValoresRol>({ rol: "auxiliar", sucursales: [] });
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const invitar = useInvitarUsuario(empresaId);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (invitar.isPending) return;
    invitar.reset();
    const r = validarFormulario(invitarUsuarioSchema, { correo, ...datosRol(rol) });
    if (!r.ok) return setErrores(r.errores);
    setErrores({});
    invitar.mutate(r.datos, {
      onSuccess: ({ mensaje }) => {
        toast.success(mensaje);
        onCerrar();
      },
      onError: (error) => error instanceof ErrorApi && setErrores(error.errores),
    });
  }

  const errorApi = invitar.error;
  const aviso =
    errores._formulario?.[0] ??
    (errorApi && !(errorApi instanceof ErrorApi && errorApi.estado === 400)
      ? mensajeDeError(errorApi)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("invitacion.titulo")}</DialogTitle>
        <DialogDescription>{t("invitacion.descripcion")}</DialogDescription>
      </DialogHeader>

      <Campo id="invitar-correo" etiqueta={t("campos.correo")} error={errores.correo?.[0]}>
        {(p) => (
          <Input
            {...p}
            type="email"
            className="h-10"
            maxLength={150}
            autoFocus
            autoComplete="off"
            placeholder={t("campos.correoEjemplo")}
            value={correo}
            onChange={(e) => {
              setCorreo(e.target.value);
              setErrores(({ correo: _quitado, ...resto }) => resto);
            }}
          />
        )}
      </Campo>

      <CamposRolSucursales
        id="invitar"
        valores={rol}
        sucursales={sucursales}
        deshabilitado={invitar.isPending}
        errorRol={errores.rol?.[0]}
        errorSucursales={errores.sucursales?.[0]}
        onCambiar={(valores) => {
          setRol(valores);
          setErrores(({ rol: _rol, sucursales: _sucursales, ...resto }) => resto);
        }}
      />

      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={invitar.isPending}>
          {t("invitacion.cancelar")}
        </Button>
        <Button type="submit" disabled={invitar.isPending}>
          {invitar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {invitar.isPending ? t("invitacion.enviando") : t("invitacion.enviar")}
        </Button>
      </DialogFooter>
    </form>
  );
}
