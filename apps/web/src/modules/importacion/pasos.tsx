import { useId, useRef, useState, type DragEvent } from "react";
import { Check, Download, FileSpreadsheet, ListTree, LoaderCircle, Scale, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";
import type { ProblemaImportacion, TipoImportacion } from "@contable/shared";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MAXIMO_MEGAS, kilobytes, ordenarProblemas } from "./archivo";

const PASOS = ["tipo", "archivo", "validacion", "listo"] as const;

/** Indicador de los cuatro pasos de la importación, como en el prototipo. */
export function IndicadorPasos({ actual }: { actual: number }) {
  const { t } = useTranslation("importacion");
  return (
    <ol aria-label={t("pasos.etiqueta")} className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {PASOS.map((paso, indice) => {
        const hecho = indice < actual;
        const esActual = indice === actual;
        return (
          <li
            key={paso}
            aria-current={esActual ? "step" : undefined}
            className="flex items-center gap-2 text-sm"
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                esActual && "border-primary bg-primary text-primary-foreground",
                hecho && "border-foreground text-foreground",
                !esActual && !hecho && "border-input text-muted-foreground",
              )}
            >
              {hecho ? <Check className="size-3.5" aria-hidden /> : indice + 1}
            </span>
            <span className={cn(esActual ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {t(`pasos.${paso}`)}
            </span>
            {indice < PASOS.length - 1 && (
              <span aria-hidden className="mx-1 hidden h-px w-8 bg-border sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const ICONOS: Record<TipoImportacion, typeof ListTree> = { catalogo: ListTree, "saldos-iniciales": Scale };

/** Paso 1: elegir qué importar y descargar su plantilla. */
export function PasoTipo({
  tipo,
  onElegir,
  onDescargarPlantilla,
  descargando,
}: {
  tipo: TipoImportacion;
  onElegir: (tipo: TipoImportacion) => void;
  onDescargarPlantilla: () => void;
  descargando: boolean;
}) {
  const { t } = useTranslation("importacion");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {(Object.keys(ICONOS) as TipoImportacion[]).map((opcion) => {
        const Icono = ICONOS[opcion];
        const elegido = opcion === tipo;
        return (
          <button
            key={opcion}
            type="button"
            aria-pressed={elegido}
            onClick={() => onElegir(opcion)}
            className={cn(
              "grid gap-3 rounded-2xl border bg-card p-5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              elegido ? "border-foreground" : "border-border hover:border-input",
            )}
          >
            <span className="flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-secondary">
                <Icono className="size-[19px]" aria-hidden />
              </span>
              <span
                aria-hidden
                className={cn(
                  "grid size-5 place-items-center rounded-full border-2",
                  elegido ? "border-foreground" : "border-input",
                )}
              >
                {elegido && <span className="size-2.5 rounded-full bg-foreground" />}
              </span>
            </span>
            <b className="text-base font-semibold text-foreground">{t(`tipos.${opcion}.titulo`)}</b>
            <span className="text-sm text-muted-foreground">{t(`tipos.${opcion}.descripcion`)}</span>
          </button>
        );
      })}

      <Card className="flex flex-wrap items-center gap-4 p-5 sm:col-span-2">
        <FileSpreadsheet className="size-[22px] text-muted-foreground" aria-hidden />
        <div className="min-w-[200px] flex-1">
          <b className="font-semibold text-foreground">{t(`tipos.${tipo}.plantilla`)}</b>
          <p className="text-sm text-muted-foreground">{t("plantilla.ayuda")}</p>
        </div>
        <button
          type="button"
          onClick={onDescargarPlantilla}
          disabled={descargando}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-input px-3.5 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
        >
          {descargando ? (
            <LoaderCircle className="size-[15px] animate-spin" aria-hidden />
          ) : (
            <Download className="size-[15px]" aria-hidden />
          )}
          {descargando ? t("plantilla.descargando") : t("plantilla.descargar")}
        </button>
      </Card>
    </div>
  );
}

/** Paso 2: subir el archivo, arrastrándolo o eligiéndolo. Revisa el formato y el tamaño antes de subirlo. */
export function PasoArchivo({
  archivo,
  error,
  onElegir,
  onQuitar,
}: {
  archivo: File | null;
  error: string | null;
  onElegir: (archivo: File) => void;
  onQuitar: () => void;
}) {
  const { t } = useTranslation("importacion");
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  function soltar(evento: DragEvent) {
    evento.preventDefault();
    setEncima(false);
    const elegido = evento.dataTransfer.files[0];
    if (elegido) onElegir(elegido);
  }

  return (
    <div className="grid gap-2">
      {archivo ? (
        <Card className="flex items-center gap-4 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-secondary">
            <FileSpreadsheet className="size-[19px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <b className="block truncate font-semibold text-foreground">{archivo.name}</b>
            <span className="text-xs text-muted-foreground">
              {t("archivo.tamano", { kb: kilobytes(archivo.size) })}
            </span>
          </div>
          <button
            type="button"
            aria-label={t("archivo.quitar")}
            onClick={onQuitar}
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="size-[17px]" aria-hidden />
          </button>
        </Card>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(evento) => {
            evento.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={soltar}
          className={cn(
            "grid cursor-pointer justify-items-center gap-2 rounded-2xl border-[1.5px] border-dashed px-5 py-14 text-center transition-colors",
            encima ? "border-foreground bg-secondary/40" : "border-input hover:border-muted-foreground",
          )}
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-card">
            <Upload className="size-[22px]" aria-hidden />
          </span>
          <b className="text-base font-semibold text-foreground">{t("archivo.elegir")}</b>
          <span className="text-sm text-muted-foreground">
            {t("archivo.formato", { megas: MAXIMO_MEGAS })}
          </span>
          <input
            ref={entrada}
            id={id}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(evento) => {
              const elegido = evento.target.files?.[0];
              if (elegido) onElegir(elegido);
              // Permite volver a elegir el mismo archivo después de corregirlo
              if (entrada.current) entrada.current.value = "";
            }}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Tabla de errores o avisos del archivo: fila, columna y qué corregir. */
export function TablaProblemas({
  problemas,
  etiqueta,
  tono,
}: {
  problemas: readonly ProblemaImportacion[];
  etiqueta: string;
  tono: "error" | "aviso";
}) {
  const { t } = useTranslation("importacion");
  return (
    <Card className="overflow-hidden">
      <Table aria-label={etiqueta}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">{t("validacion.fila")}</TableHead>
            <TableHead className="w-44">{t("validacion.columna")}</TableHead>
            <TableHead>{t("validacion.mensaje")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenarProblemas(problemas).map((problema, indice) => (
            <TableRow key={`${problema.fila}-${problema.columna}-${indice}`}>
              <TableCell className="amount text-left text-muted-foreground">
                {problema.fila ?? t("validacion.todoElArchivo")}
              </TableCell>
              <TableCell>{problema.columna ?? "—"}</TableCell>
              <TableCell
                className={cn(
                  "text-sm whitespace-normal",
                  tono === "error" ? "text-destructive" : "text-foreground",
                )}
              >
                {problema.mensaje}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
