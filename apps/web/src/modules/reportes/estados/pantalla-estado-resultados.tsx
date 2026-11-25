import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "cn";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { EncabezadoReporte } from "../comun/encabezado-reporte";
import { ExportarEstado } from "../exportacion/exportar-estado";
import { FiltrosDeReporte } from "../comun/filtros-reporte";
import { errorDeFiltros, mesDe, type FiltrosReporte } from "../comun/periodo";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { documentoEstadoResultados } from "./documento-estado-resultados";
import { estadoResultadosQuery } from "./estados-api";
import { filasEstadoResultados } from "./filas-estado-resultados";
import { TEXTOS_ESTADO_RESULTADOS as T } from "./textos";

/** Estado de resultados del período, consolidado o por sucursal (HU-37, S2-T43). */
export function PantallaEstadoResultados({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("estados.ver");
  const [filtros, setFiltros] = useState<FiltrosReporte>(() => ({ ...mesDe(), sucursalId: "" }));

  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const empresa = useQuery({ ...empresaQuery(empresaId), enabled: puedeVer });
  const errorFiltros = errorDeFiltros(filtros);
  const estado = useQuery({
    ...estadoResultadosQuery(empresaId, filtros),
    enabled: puedeVer && !errorFiltros,
  });

  const alcance = sucursales.data?.find((s) => s.id === filtros.sucursalId)?.nombre ?? R.consolidado;
  const d = estado.data;

  return (
    <Pagina className="max-w-[1000px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {d && empresa.data && (
          <ExportarEstado documento={documentoEstadoResultados(d)} empresa={empresa.data} alcance={alcance} />
        )}
      </EncabezadoPagina>

      {!puedeVer ? (
        <Alert>{R.sinPermiso}</Alert>
      ) : (
        <>
          <FiltrosDeReporte
            valor={filtros}
            onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
            sucursales={sucursales.data ?? []}
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

          {d && !estado.isError && (
            <Card className="overflow-hidden">
              <EncabezadoReporte
                empresaId={empresaId}
                titulo={T.titulo}
                periodo={`Del ${formatearFecha(d.desde)} al ${formatearFecha(d.hasta)}`}
                alcance={`${alcance} · ${T.enDolares}`}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{T.concepto}</TableHead>
                    <TableHead className="text-right">{T.monto}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasEstadoResultados(d).map((f) => (
                    <TableRow
                      key={f.id}
                      className={cn(
                        f.tipo === "resultado" && "bg-secondary/60 font-bold",
                        f.tipo === "seccion" && "font-semibold",
                        f.tipo === "total" && "border-t font-medium",
                      )}
                    >
                      <TableCell
                        className={cn(
                          f.tipo === "renglon" && "pl-6 text-muted-foreground",
                          f.tipo === "total" && "pl-6",
                        )}
                      >
                        {f.texto}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.monto === undefined ? null : formatearDinero(f.monto, { simbolo: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            {T.nota} {R.nota}
          </p>
        </>
      )}
    </Pagina>
  );
}
