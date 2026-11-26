import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { TRAMOS_ANTIGUEDAD, type OperacionComercial } from "@contable/shared";
import { Campo } from "@/components/campo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { antiguedadQuery } from "./antiguedad-api";
import { crearAntiguedadExcel, descargarAntiguedadExcel, imprimirAntiguedad } from "./antiguedad-exportar";
import { TEXTOS_ANTIGUEDAD as T } from "./textos";

/** Antigüedad de saldos (HU-63): clientes o proveedores por tramos de atraso, con exportación a PDF y Excel. */
export function AntiguedadSaldos({ empresaId }: { empresaId: string }) {
  const [operacion, setOperacion] = useState<OperacionComercial>("venta");
  const [alFecha, setAlFecha] = useState(hoyIso());
  const empresa = useQuery(empresaQuery(empresaId));
  const reporte = useQuery({ ...antiguedadQuery(empresaId, operacion, alFecha), enabled: alFecha !== "" });
  const datos = { empresa: empresa.data?.nombre ?? "" };

  async function exportarExcel() {
    if (!reporte.data) return;
    try {
      descargarAntiguedadExcel(await crearAntiguedadExcel(reporte.data, datos), reporte.data);
      toast.success(T.exportar.exportado);
    } catch (error) {
      toast.error(`${T.exportar.error} ${mensajeDeError(error)}`);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label={T.etiquetaLado} className="flex gap-1 rounded-full bg-muted p-1">
          {(["venta", "compra"] as const).map((o) => (
            <Button
              key={o}
              type="button"
              size="sm"
              variant={operacion === o ? "default" : "ghost"}
              className="rounded-full"
              aria-pressed={operacion === o}
              onClick={() => setOperacion(o)}
            >
              {T.lados[o]}
            </Button>
          ))}
        </div>
        <Campo id="antiguedad-fecha" etiqueta={T.fechaCorte}>
          {(p) => (
            <Input
              {...p}
              type="date"
              className="h-10"
              value={alFecha}
              onChange={(e) => setAlFecha(e.target.value)}
            />
          )}
        </Campo>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-full"
          disabled={!reporte.data}
          onClick={() => {
            if (reporte.data && !imprimirAntiguedad(reporte.data, datos))
              toast.error(T.exportar.errorVentanas);
          }}
        >
          <FileText aria-hidden="true" />
          {T.exportar.pdf}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-full"
          disabled={!reporte.data}
          onClick={() => void exportarExcel()}
        >
          <FileSpreadsheet aria-hidden="true" />
          {T.exportar.excel}
        </Button>
      </div>

      {reporte.isPending && reporte.fetchStatus !== "idle" && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {reporte.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(reporte.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void reporte.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {reporte.isSuccess && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label={T.titulo(operacion)}>
            {TRAMOS_ANTIGUEDAD.map((t) => (
              <Card key={t} className="p-4">
                <span className="text-xs text-muted-foreground">{T.tramos[t]}</span>
                <b className="mt-1 block text-xl font-semibold tabular-nums">
                  {formatearDinero(reporte.data.totales[t])}
                </b>
              </Card>
            ))}
          </div>
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">{T.titulo(operacion)}</h2>
              <p className="text-sm text-muted-foreground">
                {T.alFecha(formatearFecha(reporte.data.alFecha))}
              </p>
            </div>
            {reporte.data.filas.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">{T.vacio[operacion]}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{T.tercero[operacion]}</TableHead>
                    {TRAMOS_ANTIGUEDAD.map((t) => (
                      <TableHead key={t} className="text-right">
                        {T.tramos[t]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">{T.total}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reporte.data.filas.map((f) => (
                    <TableRow key={f.tercero.id}>
                      <TableCell>{f.tercero.nombre}</TableCell>
                      {TRAMOS_ANTIGUEDAD.map((t) => (
                        <TableCell key={t} className="text-right tabular-nums">
                          {formatearDinero(f.tramos[t], { simbolo: false })}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatearDinero(f.total, { simbolo: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">{T.totales}</TableCell>
                    {TRAMOS_ANTIGUEDAD.map((t) => (
                      <TableCell key={t} className="text-right font-semibold tabular-nums">
                        {formatearDinero(reporte.data.totales[t], { simbolo: false })}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatearDinero(reporte.data.totales.total, { simbolo: false })}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </Card>
          <Alert variant={reporte.data.cuadre.cuadra ? "info" : "error"}>
            {reporte.data.cuadre.cuadra
              ? T.cuadre.cuadra(reporte.data.cuadre.cuenta)
              : T.cuadre.noCuadra(
                  reporte.data.cuadre.cuenta,
                  formatearDinero(reporte.data.cuadre.saldoMayor),
                  formatearDinero(reporte.data.cuadre.diferencia),
                )}
          </Alert>
          <p className="text-xs text-muted-foreground">{T.nota}</p>
        </>
      )}
    </div>
  );
}
