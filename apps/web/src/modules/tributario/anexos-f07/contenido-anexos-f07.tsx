import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FileDown } from "lucide-react";
import { toast } from "sonner";
import type { AnexoF07 } from "@contable/shared";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { anexosF07Query, limitesDelMes } from "./anexos-f07-api";
import { descargarCsv } from "./descargar-csv";
import { TEXTOS_ANEXOS_F07 as T } from "./textos";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const FILAS_DE_MUESTRA = 5;
const MAXIMO_ERRORES = 8;

function nombreArchivo(anexo: AnexoF07, periodo: string): string {
  return `${T.prefijoArchivo}-${anexo.archivo}-${periodo}.csv`;
}

/** Contenido de la pestaña de anexos del F-07: los tres libros del mes en CSV, con sus errores antes de exportar (HU-51). */
export function ContenidoAnexosF07({ empresaId, periodo }: { empresaId: string; periodo: string }) {
  const puedeVer = usePermiso("iva.ver");
  const [elegido, setElegido] = useState<string>("compras");
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const periodoValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100 && mes >= 1 && mes <= 12;
  const consulta = useQuery({
    ...anexosF07Query(empresaId, periodo),
    enabled: Boolean(empresaId) && periodoValido && puedeVer,
  });
  const vista = consulta.data;

  if (!puedeVer) return <Alert>{T.sinPermiso}</Alert>;

  const anexo = vista?.anexos.find((a) => a.id === elegido) ?? vista?.anexos[0];
  const todosListos = vista ? vista.anexos.every((a) => a.errores.length === 0) : false;

  function descargar(a: AnexoF07) {
    descargarCsv(a.csv, nombreArchivo(a, periodo));
    toast.success(T.descargado);
  }

  function descargarTodos() {
    if (!vista) return;
    for (const a of vista.anexos) descargarCsv(a.csv, nombreArchivo(a, periodo));
    toast.success(T.descargados);
  }

  return (
    <>
      {consulta.isPending && periodoValido && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {consulta.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {vista && anexo && (
        <>
          <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-60 flex-1">
              <h2 className="text-base font-semibold">{T.encabezado(MESES[mes - 1] ?? "", anio)}</h2>
              <p className="text-sm text-muted-foreground">
                {limitesDelMes(periodo).desde} a {limitesDelMes(periodo).hasta}
              </p>
            </div>
            {todosListos ? (
              <Badge variant="solida">
                <CircleCheck aria-hidden="true" className="size-3.5" />
                {T.estado.listos}
              </Badge>
            ) : (
              <Badge variant="alerta">
                <CircleAlert aria-hidden="true" className="size-3.5" />
                {T.estado.conErrores(vista.anexos.reduce((n, a) => n + a.errores.length, 0))}
              </Badge>
            )}
            <Button disabled={!todosListos} onClick={descargarTodos}>
              <FileDown aria-hidden="true" />
              {T.generarTodos}
            </Button>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={T.pestana}>
            {vista.anexos.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={anexo.id === a.id}
                onClick={() => setElegido(a.id)}
                className={`grid gap-1 rounded-2xl border bg-card p-4 text-left transition-colors ${
                  anexo.id === a.id ? "border-foreground/60" : "border-border hover:border-foreground/30"
                }`}
              >
                <b className="font-semibold">{a.nombre}</b>
                <span className="text-sm text-muted-foreground">{T.registros(a.filas.length)}</span>
                <span className="text-lg font-semibold tabular-nums">{formatearDinero(a.total)}</span>
                {a.errores.length > 0 && (
                  <span className="text-sm text-destructive">{T.estado.conErrores(a.errores.length)}</span>
                )}
              </button>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">{anexo.nombre}</h2>
                <p className="text-sm text-muted-foreground">
                  {T.vistaPrevia(
                    anexo.filas.length,
                    formatearDinero(anexo.total),
                    Math.min(FILAS_DE_MUESTRA, anexo.filas.length),
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={anexo.errores.length > 0 || anexo.filas.length === 0}
                onClick={() => descargar(anexo)}
              >
                <FileDown aria-hidden="true" />
                {T.generarCsv}
              </Button>
            </div>
            {anexo.errores.length > 0 && (
              <Alert variant="error" className="m-4">
                <p className="font-semibold">{T.erroresTitulo}</p>
                <p>{T.erroresAyuda}</p>
                <ul className="mt-2 list-disc pl-5">
                  {anexo.errores.slice(0, MAXIMO_ERRORES).map((e) => (
                    <li key={`${e.fila}-${e.columna}`}>{e.mensaje}</li>
                  ))}
                  {anexo.errores.length > MAXIMO_ERRORES && (
                    <li>{T.masErrores(anexo.errores.length - MAXIMO_ERRORES)}</li>
                  )}
                </ul>
              </Alert>
            )}
            {anexo.filas.length === 0 ? (
              <p className="px-4 py-6 text-muted-foreground">{T.sinRegistros}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      {anexo.columnas.map((c, i) => (
                        <th
                          key={c}
                          scope="col"
                          className={`px-4 py-2 font-medium whitespace-nowrap ${i >= 5 || anexo.id === "consumidor" ? "text-right" : ""}`}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {anexo.filas.slice(0, FILAS_DE_MUESTRA).map((fila, i) => (
                      <tr key={`${i}-${fila[2]}`} className="border-t border-border">
                        {fila.map((valor, j) => (
                          <td
                            key={anexo.columnas[j]}
                            className={`px-4 py-2 whitespace-nowrap tabular-nums ${j >= 5 || anexo.id === "consumidor" ? "text-right" : ""}`}
                          >
                            {valor}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{T.formato}</p>
          </Card>
        </>
      )}
    </>
  );
}
