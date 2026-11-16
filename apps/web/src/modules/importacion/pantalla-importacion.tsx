import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CircleCheck, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ReporteImportacion, TipoImportacion } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mensajeDeError } from "@/lib/api";
import { descargarArchivo } from "@/lib/descargas";
import { formatearDinero } from "@/lib/formato";
import { usePermiso, usePermisos } from "@/modules/organizacion/permisos";
import { crearReporteErrores, filasConErrores, revisarArchivo } from "./archivo";
import { descargarPlantilla, validarArchivo } from "./importacion-api";
import { IndicadorPasos, PasoArchivo, PasoTipo, TablaProblemas } from "./pasos";

type Paso = 0 | 1 | 2;

const BOTON = "h-11 rounded-full px-5";

/** Resultado de la validación: errores por fila que impiden la carga, o el resumen de lo que se cargaría. */
function ResultadoValidacion({
  reporte,
  onSubirCorregido,
  onAtras,
}: {
  reporte: ReporteImportacion;
  onSubirCorregido: () => void;
  onAtras: () => void;
}) {
  const { t } = useTranslation("importacion");
  const reporteErrores = useMutation({
    mutationFn: () => crearReporteErrores(reporte, t),
    onSuccess: ({ contenido, nombre }) => descargarArchivo(contenido, nombre),
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  if (!reporte.valido) {
    const filas = filasConErrores(reporte);
    return (
      <div className="grid gap-4">
        <Alert variant="error">
          <p>
            <b>{filas > 0 ? t("validacion.errores", { cantidad: filas }) : t("validacion.errorArchivo")}</b>{" "}
            {t("validacion.erroresDetalle")}
          </p>
        </Alert>
        <TablaProblemas problemas={reporte.errores} etiqueta={t("validacion.tablaErrores")} tono="error" />
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="outline"
            className={BOTON}
            disabled={reporteErrores.isPending}
            onClick={() => reporteErrores.mutate()}
          >
            <Download aria-hidden />
            {t("validacion.descargarReporte")}
          </Button>
          <Button className={BOTON} onClick={onSubirCorregido}>
            {t("acciones.subirCorregido")}
          </Button>
        </div>
      </div>
    );
  }

  const resumen =
    reporte.tipo === "catalogo"
      ? t("validacion.resumenCatalogo", { filas: reporte.filas.length })
      : reporte.resumen.cuadra
        ? t("validacion.resumenSaldos", { total: formatearDinero(reporte.resumen.totalDebe) })
        : t("validacion.descuadre", {
            debe: formatearDinero(reporte.resumen.totalDebe),
            haber: formatearDinero(reporte.resumen.totalHaber),
            diferencia: formatearDinero(reporte.resumen.diferencia),
          });

  return (
    <div className="grid gap-4">
      <Card className="grid gap-1 p-5">
        <span className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CircleCheck className="size-[19px]" aria-hidden />
          {t("validacion.validas", { filas: reporte.filasLeidas })}
        </span>
        <p className="text-sm text-muted-foreground">{resumen}</p>
      </Card>

      {reporte.advertencias.length > 0 && (
        <div className="grid gap-2">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <AlertTriangle className="size-4" aria-hidden />
            <b>{t("validacion.advertencias", { cantidad: reporte.advertencias.length })}</b>
            <span className="text-muted-foreground">{t("validacion.advertenciasDetalle")}</span>
          </p>
          <TablaProblemas
            problemas={reporte.advertencias}
            etiqueta={t("validacion.tablaAdvertencias")}
            tono="aviso"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" className={BOTON} onClick={onAtras}>
          {t("acciones.atras")}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">{t("validacion.cargaPendiente")}</span>
          {/* La carga (S1-T70) todavía no tiene API: por ahora solo se valida */}
          <Button className={BOTON} disabled>
            {t("acciones.importar", { filas: reporte.filas.length })}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Pantalla para importar el catálogo o los saldos iniciales desde Excel (S1-T71, HU-17), como en el prototipo:
 * elegir qué importar y descargar la plantilla, subir el archivo y ver el reporte de errores por fila.
 */
export function PantallaImportacion({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const { t } = useTranslation("importacion");
  const { estado } = usePermisos();
  const puedeImportar = usePermiso("catalogo.importar");
  const [paso, setPaso] = useState<Paso>(0);
  const [tipo, setTipo] = useState<TipoImportacion>("catalogo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  const plantilla = useMutation({
    mutationFn: () => descargarPlantilla(empresaId, tipo),
    onSuccess: ({ contenido, nombre }) => descargarArchivo(contenido, nombre),
    onError: (error) => toast.error(`${t("plantilla.error")} ${mensajeDeError(error)}`),
  });
  const validacion = useMutation({
    mutationFn: (elegido: File) => validarArchivo(empresaId, tipo, elegido),
    onSuccess: () => setPaso(2),
  });

  function elegirArchivo(elegido: File) {
    const problema = revisarArchivo(elegido, t);
    setErrorArchivo(problema);
    setArchivo(problema ? null : elegido);
    validacion.reset();
  }

  function subirOtro() {
    setArchivo(null);
    setErrorArchivo(null);
    validacion.reset();
    setPaso(1);
  }

  return (
    <Pagina className="max-w-[1000px]">
      <EncabezadoPagina titulo={t("titulo")} descripcion={t("descripcion")} />

      {estado === "listo" && !puedeImportar ? (
        <Alert variant="error">{t("sinPermiso")}</Alert>
      ) : (
        <>
          <IndicadorPasos actual={paso} />

          {paso === 0 && (
            <>
              <PasoTipo
                tipo={tipo}
                onElegir={setTipo}
                onDescargarPlantilla={() => plantilla.mutate()}
                descargando={plantilla.isPending}
              />
              <div className="flex justify-end">
                <Button className={BOTON} onClick={() => setPaso(1)}>
                  {t("acciones.continuar")}
                </Button>
              </div>
            </>
          )}

          {paso === 1 && (
            <>
              <PasoArchivo
                archivo={archivo}
                error={errorArchivo}
                onElegir={elegirArchivo}
                onQuitar={() => setArchivo(null)}
              />
              {validacion.isError && (
                <Alert variant="error">
                  {t("validacion.error")} {mensajeDeError(validacion.error)}
                </Alert>
              )}
              <div className="flex justify-between gap-2">
                <Button variant="ghost" className={BOTON} onClick={() => setPaso(0)}>
                  {t("acciones.atras")}
                </Button>
                <Button
                  className={BOTON}
                  disabled={!archivo || validacion.isPending}
                  onClick={() => archivo && validacion.mutate(archivo)}
                >
                  {validacion.isPending ? t("acciones.validando") : t("acciones.validar")}
                </Button>
              </div>
            </>
          )}

          {paso === 2 && validacion.data && (
            <ResultadoValidacion
              reporte={validacion.data}
              onSubirCorregido={subirOtro}
              onAtras={() => setPaso(1)}
            />
          )}
        </>
      )}
    </Pagina>
  );
}
