import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSesionOpcional, type UsuarioSesion } from "@/modules/sesion";

function Avatar({ usuario, className }: { usuario: UsuarioSesion; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground",
        className,
      )}
    >
      {usuario.iniciales}
    </span>
  );
}

function DatosUsuario({ usuario }: { usuario: UsuarioSesion }) {
  return (
    <div className="min-w-0 flex-1">
      <b className="block truncate font-semibold text-foreground">{usuario.nombre}</b>
      <span className="block truncate text-xs text-muted-foreground">{usuario.correo}</span>
    </div>
  );
}

/** Avatar del usuario en el encabezado; abre sus datos y la opción de cerrar sesión (S1-T34). */
export function MenuCuenta() {
  const { t } = useTranslation("layout");
  const sesion = useSesionOpcional();
  const usuario = sesion?.usuario;
  if (!sesion || !usuario) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("cuenta.etiqueta")}
          title={usuario.nombre}
          className="shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Avatar usuario={usuario} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center gap-3 p-4">
          <Avatar usuario={usuario} />
          <DatosUsuario usuario={usuario} />
        </div>
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => void sesion.cerrarSesion()}
            className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <LogOut className="size-4" aria-hidden />
            {t("cuenta.cerrarSesion")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Usuario y botón «Salir» al pie del menú principal, como en el prototipo (S1-T34). */
export function FilaCuenta() {
  const { t } = useTranslation("layout");
  const sesion = useSesionOpcional();
  const usuario = sesion?.usuario;
  if (!sesion || !usuario) return null;

  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-3 text-sm">
      <Avatar usuario={usuario} />
      <DatosUsuario usuario={usuario} />
      <button
        type="button"
        onClick={() => void sesion.cerrarSesion()}
        aria-label={t("cuenta.cerrarSesion")}
        className="inline-flex h-9 items-center gap-2 rounded-full px-3 font-semibold text-foreground hover:bg-secondary"
      >
        <LogOut className="size-[15px]" aria-hidden />
        <span className="hidden sm:inline">{t("cuenta.salir")}</span>
      </button>
    </div>
  );
}
