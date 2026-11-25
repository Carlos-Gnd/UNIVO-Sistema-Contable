import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NOMBRES_ESTADOS, type ActividadFlujo } from "@contable/shared";
import { cn } from "cn";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { EncabezadoReporte } from "../comun/encabezado-reporte";
import { FiltrosDeReporte } from "../comun/filtros-reporte";
import { errorDeFiltros, mesDe, type FiltrosEstado } from "../comun/periodo";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { ExportarEstado } from "../exportacion/exportar-estado";
import { documentoFlujoEfectivo } from "./documento-flujo";
import { flujoEfectivoQuery } from "./flujo-api";
import { TEXTOS_ESTADOS_ADICIONALES as T } from "./textos";

const F = T.flujo;
const monto = (valor: string) => formatearDinero(valor, { simbolo: false });

/** Filas de una actividad: su encabezado, los renglones y el efectivo neto. */
function FilasActividad({ actividad, total }: { actividad: ActividadFlujo; total: string }) {
  return (
    <>
      <TableRow className="bg-secondary/40">
        <TableCell colSpan={2} className="font-semibold">
          {actividad.titulo}
        </TableCell>
      </TableRow>
      {actividad.renglones.map((r) => (
        <TableRow key={r.id}>
          <TableCell className="pl-8">{r.concepto}</TableCell>
          <TableCell className="text-right tabular-nums">{monto(r.monto)}</TableCell>
        </TableRow>
      ))}
      {actividad.renglones.length === 0 && (
        <TableRow>
          <TableCell colSpan={2} className="pl-8 text-muted-foreground">
            {F.sinMovimientos}
          </TableCell>
        </TableRow>
      )}
      <TableRow className="font-semibold">
        <TableCell>{total}</TableCell>
        <TableCell className="text-right tabular-nums">{monto(actividad.total)}</TableCell>
      </TableRow>
    </>
  );
}

/**
 * Estado de flujo de efectivo por el método indirecto (S3-T23, HU-41): operación, inversión y financiamiento,
 * la variación neta y el efectivo al inicio y al final del período.
 */
export function PanelFlujo({ empresaId, idPanel }: { empresaId: string; idPanel: string }) {
  const [filtros, setFiltros] = useState<FiltrosEstado>(() => ({ ...mesDe(), sucursalId: "", formato: "" }));
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const empresa = useQuery(empresaQuery(empresaId));
  const errorFiltros = errorDeFiltros(filtros);
  const estado = useQuery({ ...flujoEfectivoQuery(empresaId, filtros), enabled: !errorFiltros });

  const alcance = sucursales.data?.find((s) => s.id === filtros.sucursalId)?.nombre ?? R.consolidado;
  const d = estado.data;
  const N = d ? NOMBRES_ESTADOS[d.formato].flujo : null;

  return (
    <div id={idPanel} role="tabpanel" className="grid gap-4">
      <FiltrosDeReporte
        valor={filtros}
        onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
        sucursales={sucursales.data ?? []}
        formato={{
          valor: filtros.formato,
          actual: d?.formato,
          onCambio: (formato) => setFiltros((f) => ({ ...f, formato })),
        }}
        acciones={
          d && empresa.data ? (
            <ExportarEstado documento={documentoFlujoEfectivo(d)} empresa={empresa.data} alcance={alcance} />
          ) : undefined
        }
      />

      {estado.isFetching && !d && (
        <p role="status" className="text-muted-foreground">
          {R.cargando}
        </p>
      )}
      {estado.isError && (
        <Alert variant="error">
          <p>
            {R.error} {mensajeDeError(estado.error)}
          </p>
          {!(estado.error instanceof ErrorApi && estado.error.estado === 403) && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void estado.refetch()}>
              {R.reintentar}
            </Button>
          )}
        </Alert>
      )}

      {d && N && !estado.isError && (
        <Card className={cn("overflow-hidden", estado.isFetching && "opacity-60")}>
          <EncabezadoReporte
            empresaId={empresaId}
            titulo={d.titulo}
            periodo={F.periodo(formatearFecha(d.desde), formatearFecha(d.hasta))}
            alcance={`${alcance} · ${F.enDolares}`}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{F.concepto}</TableHead>
                <TableHead className="text-right">{F.columnaMonto}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <FilasActividad actividad={d.operacion} total={F.totalOperacion} />
              <FilasActividad actividad={d.inversion} total={F.totalInversion} />
              <FilasActividad actividad={d.financiamiento} total={F.totalFinanciamiento} />
              <TableRow className="bg-secondary/60 font-bold">
                <TableCell>{N.variacionNeta}</TableCell>
                <TableCell className="text-right tabular-nums">{monto(d.variacionNeta)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{N.efectivoInicial}</TableCell>
                <TableCell className="text-right tabular-nums">{monto(d.efectivoInicial)}</TableCell>
              </TableRow>
              <TableRow className="bg-secondary/60 font-bold">
                <TableCell>{N.efectivoFinal}</TableCell>
                <TableCell className="text-right tabular-nums">{monto(d.efectivoFinal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p
            role={d.cuadra ? undefined : "alert"}
            className={cn(
              "border-t border-border px-5 py-3 text-sm",
              d.cuadra ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {d.cuadra
              ? F.cuadra(formatearDinero(d.variacionLibros))
              : F.noCuadra(formatearDinero(d.variacionNeta), formatearDinero(d.variacionLibros))}
          </p>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        {F.nota} {R.nota}
      </p>
    </div>
  );
}
