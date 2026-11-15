import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { mensajeDeError } from "@/lib/api";
import { usePermiso } from "@/modules/organizacion/permisos";
import {
  DemasiadosRegistrosError,
  MAXIMO_EXPORTACION,
  crearLibroBitacora,
  descargar,
  nombreArchivo,
  todosLosRegistros,
} from "./exportar";
import { aConsulta, type FiltrosPantalla } from "./filtros";

/**
 * Exporta a Excel todos los cambios que cumplen los filtros de la pantalla (S1-T60). Solo lo ve quien tiene el
 * permiso bitacora.exportar (administrador y contador).
 */
export function BotonExportar({
  empresaId,
  filtros,
  deshabilitado,
}: {
  empresaId: string;
  filtros: FiltrosPantalla;
  deshabilitado: boolean;
}) {
  const { t } = useTranslation("bitacora");
  const puedeExportar = usePermiso("bitacora.exportar");
  const [exportando, setExportando] = useState(false);
  if (!puedeExportar) return null;

  async function exportar() {
    setExportando(true);
    try {
      const registros = await todosLosRegistros(empresaId, aConsulta(filtros, 1));
      descargar(await crearLibroBitacora(registros, filtros, t), nombreArchivo(t));
      toast.success(t("exportar.listo", { total: registros.length }));
    } catch (error) {
      toast.error(
        error instanceof DemasiadosRegistrosError
          ? t("exportar.demasiados", { total: error.total, maximo: MAXIMO_EXPORTACION })
          : `${t("exportar.error")} ${mensajeDeError(error)}`,
      );
    } finally {
      setExportando(false);
    }
  }

  return (
    <Button
      variant="outline"
      className="h-11 rounded-full px-5"
      disabled={deshabilitado || exportando}
      onClick={() => void exportar()}
    >
      {exportando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {exportando ? t("exportar.exportando") : t("exportar.boton")}
    </Button>
  );
}
