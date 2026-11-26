import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivoFijoVista } from "@contable/shared";
import { Campo } from "@/components/campo";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero } from "@/lib/formato";
import { cuadroQuery } from "./depreciacion-api";
import { nombreDelMes, TEXTOS_DEPRECIACION } from "./textos";

const T = TEXTOS_DEPRECIACION.cuadro;
const dinero = (monto: string) => formatearDinero(monto, { simbolo: false });

/** Cuadro de depreciación de un activo a lo largo de su vida útil, con los meses ya generados (S3-T131, HU-82). */
export function CuadroActivo({
  empresaId,
  activos,
}: {
  empresaId: string;
  activos: readonly ActivoFijoVista[];
}) {
  const [elegido, setElegido] = useState<string>();
  const activoId = elegido ?? activos[0]?.id;
  const cuadro = useQuery({ ...cuadroQuery(empresaId, activoId ?? ""), enabled: activoId !== undefined });

  if (activos.length === 0) return <p className="text-muted-foreground">{T.sinActivos}</p>;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 border-b border-border p-4 sm:px-5">
        <Campo id="cuadro-activo" etiqueta={T.activo} className="sm:w-80">
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={activoId}
              onChange={(e) => setElegido(e.target.value)}
            >
              {activos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} · {a.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        {cuadro.data && (
          <div>
            <h2 className="font-semibold">{T.titulo(cuadro.data.activo.nombre)}</h2>
            <p className="text-sm text-muted-foreground">
              {T.resumen(
                nombreDelMes(cuadro.data.filas[0]?.mes ?? ""),
                cuadro.data.activo.tasaAnual,
                cuadro.data.filas.length,
              )}
            </p>
          </div>
        )}
      </div>
      {cuadro.isError && (
        <Alert variant="error" className="m-4">
          {mensajeDeError(cuadro.error)}
        </Alert>
      )}
      {cuadro.data && (
        <div className="max-h-[32rem] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.mes}</TableHead>
                <TableHead className="text-right">{T.cuota}</TableHead>
                <TableHead className="text-right">{T.acumulada}</TableHead>
                <TableHead className="text-right">{T.enLibros}</TableHead>
                <TableHead>{T.estado}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuadro.data.filas.map((f) => (
                <TableRow key={f.mes}>
                  <TableCell>{nombreDelMes(f.mes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{dinero(f.cuota)}</TableCell>
                  <TableCell className="text-right tabular-nums">{dinero(f.acumulada)}</TableCell>
                  <TableCell className="text-right tabular-nums">{dinero(f.valorEnLibros)}</TableCell>
                  <TableCell>
                    <Badge variant={f.estado === "generada" ? "neutra" : "contorno"}>
                      {f.estado === "generada" ? T.generada : T.pendiente}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
