import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AccionBitacora, ModuloBitacora } from "@contable/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  ACCIONES,
  FILTROS_INICIALES,
  MODULOS,
  RANGOS,
  hayFiltros,
  rangoInvalido,
  type FiltrosPantalla,
} from "./filtros";
import { fechasDeRango, type RangoFechas } from "./presentacion";

const SELECTOR = "h-10 w-auto min-w-44 rounded-full px-4";

/** Barra de filtros de la bitácora: módulo, acción, fechas y usuario (S1-T59). */
export function FiltrosBitacora({
  filtros,
  onCambiar,
}: {
  filtros: FiltrosPantalla;
  onCambiar: (filtros: FiltrosPantalla) => void;
}) {
  const { t } = useTranslation("bitacora");
  const invalido = rangoInvalido(filtros);

  function elegirRango(rango: RangoFechas) {
    // El rango personalizado parte de las fechas que ya estaban elegidas
    const fechas =
      rango === "personalizado" ? { desde: filtros.desde, hasta: filtros.hasta } : fechasDeRango(rango);
    onCambiar({ ...filtros, rango, ...fechas });
  }

  return (
    <div role="group" aria-label={t("filtros.etiqueta")} className="grid gap-3 border-b border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <NativeSelect
            aria-label={t("filtros.modulo")}
            className={SELECTOR}
            value={filtros.modulo ?? ""}
            onChange={(e) =>
              onCambiar({ ...filtros, modulo: (e.target.value || undefined) as ModuloBitacora | undefined })
            }
          >
            <option value="">{t("filtros.todosModulos")}</option>
            {MODULOS.map((modulo) => (
              <option key={modulo} value={modulo}>
                {t(`modulos.${modulo}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <NativeSelect
            aria-label={t("filtros.accion")}
            className={SELECTOR}
            value={filtros.accion ?? ""}
            onChange={(e) =>
              onCambiar({ ...filtros, accion: (e.target.value || undefined) as AccionBitacora | undefined })
            }
          >
            <option value="">{t("filtros.todasAcciones")}</option>
            {ACCIONES.map((accion) => (
              <option key={accion} value={accion}>
                {t(`acciones.${accion}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <NativeSelect
            aria-label={t("filtros.fechas")}
            className={SELECTOR}
            value={filtros.rango}
            onChange={(e) => elegirRango(e.target.value as RangoFechas)}
          >
            {RANGOS.map((rango) => (
              <option key={rango} value={rango}>
                {t(`filtros.rangos.${rango}`)}
              </option>
            ))}
          </NativeSelect>
        </div>

        {filtros.usuario && (
          <span className="inline-flex h-10 items-center gap-1 rounded-full border border-input bg-secondary pr-1 pl-4 text-sm text-foreground">
            {t("filtros.usuario", { nombre: filtros.usuario.nombre })}
            <button
              type="button"
              aria-label={t("filtros.quitarUsuario", { nombre: filtros.usuario.nombre })}
              onClick={() => onCambiar({ ...filtros, usuario: undefined })}
              className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        )}

        {hayFiltros(filtros) && (
          <Button
            variant="ghost"
            className="h-10 rounded-full px-4"
            onClick={() => onCambiar(FILTROS_INICIALES)}
          >
            {t("filtros.limpiar")}
          </Button>
        )}
      </div>

      {filtros.rango === "personalizado" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("filtros.desde")}</span>
            <Input
              type="date"
              className="h-10 w-auto rounded-full px-4"
              value={filtros.desde ?? ""}
              max={filtros.hasta}
              onChange={(e) => onCambiar({ ...filtros, desde: e.target.value || undefined })}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("filtros.hasta")}</span>
            <Input
              type="date"
              className="h-10 w-auto rounded-full px-4"
              value={filtros.hasta ?? ""}
              min={filtros.desde}
              aria-invalid={invalido}
              onChange={(e) => onCambiar({ ...filtros, hasta: e.target.value || undefined })}
            />
          </label>
          {invalido && (
            <p role="alert" className="pb-2.5 text-sm text-destructive">
              {t("filtros.rangoInvalido")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
