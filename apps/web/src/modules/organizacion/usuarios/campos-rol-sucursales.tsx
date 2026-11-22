import { useTranslation } from "react-i18next";
import { cn } from "cn";
import type { SucursalDetalle } from "@contable/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { ROLES, rolUsaSucursales, type ValoresRol } from "./rol-sucursales";

interface CamposRolSucursalesProps {
  id: string;
  valores: ValoresRol;
  onCambiar: (valores: ValoresRol) => void;
  /** Sucursales activas de la empresa */
  sucursales: readonly SucursalDetalle[];
  errorRol?: string;
  errorSucursales?: string;
  deshabilitado?: boolean;
}

/**
 * Elección del rol y, para el auxiliar y el usuario de consulta, de sus sucursales (S1-T49). La usan el
 * diálogo de invitación y el de asignación.
 */
export function CamposRolSucursales({
  id,
  valores,
  onCambiar,
  sucursales,
  errorRol,
  errorSucursales,
  deshabilitado = false,
}: CamposRolSucursalesProps) {
  const { t } = useTranslation("usuarios");
  const usaSucursales = rolUsaSucursales(valores.rol);

  function alternarSucursal(sucursalId: string, marcada: boolean) {
    const otras = valores.sucursales.filter((s) => s !== sucursalId);
    onCambiar({ ...valores, sucursales: marcada ? [...otras, sucursalId] : otras });
  }

  return (
    <>
      <fieldset className="grid gap-2" aria-describedby={errorRol ? `${id}-rol-error` : undefined}>
        <legend className="mb-2 text-sm font-medium">{t("campos.rol")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((rol) => (
            <label
              key={rol}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border border-input p-3 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                valores.rol === rol && "border-primary bg-secondary",
                deshabilitado && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={`${id}-rol`}
                value={rol}
                checked={valores.rol === rol}
                disabled={deshabilitado}
                onChange={() => onCambiar({ ...valores, rol })}
                className="mt-0.5 accent-[var(--primary)]"
              />
              <span>
                <span className="block font-semibold">{t(`roles.${rol}`)}</span>
                <span className="text-muted-foreground">{t(`descripcionRoles.${rol}`)}</span>
              </span>
            </label>
          ))}
        </div>
        {errorRol && <FieldError id={`${id}-rol-error`}>{errorRol}</FieldError>}
      </fieldset>

      <fieldset
        className="grid gap-2"
        aria-describedby={errorSucursales ? `${id}-sucursales-error` : `${id}-sucursales-ayuda`}
      >
        <legend className="mb-2 text-sm font-medium">{t("campos.sucursales")}</legend>
        {usaSucursales ? (
          <>
            {sucursales.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("campos.sinSucursales")}</p>
            ) : (
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border border-input p-2">
                {sucursales.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary"
                  >
                    <Checkbox
                      checked={valores.sucursales.includes(s.id)}
                      disabled={deshabilitado}
                      onChange={(e) => alternarSucursal(s.id, e.target.checked)}
                    />
                    <span className="flex-1">{s.nombre}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.codigoEstablecimiento}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {errorSucursales ? (
              <FieldError id={`${id}-sucursales-error`}>{errorSucursales}</FieldError>
            ) : (
              <p id={`${id}-sucursales-ayuda`} className="text-sm text-muted-foreground">
                {t("campos.sucursalesAyuda")}
              </p>
            )}
          </>
        ) : (
          <p id={`${id}-sucursales-ayuda`} className="text-sm text-muted-foreground">
            {t("campos.sucursalesTodas")}
          </p>
        )}
      </fieldset>
    </>
  );
}
