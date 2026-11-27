import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { BotonFirmarEstado } from "../firma/boton-firmar-estado";
import { useAnexoNotas } from "../notas/anexo-notas";
import { documentoCambiosPatrimonio } from "./documento-patrimonio";
import { cambiosPatrimonioQuery } from "./patrimonio-api";
import { TEXTOS_ESTADOS_ADICIONALES as T } from "./textos";

const P = T.patrimonio;
const monto = (valor: string) => formatearDinero(valor, { simbolo: false });

/**
 * Estado de cambios en el patrimonio (S3-T20, HU-40): saldo inicial, aportes, reservas, resultado, retiros y
 * saldo final, con las columnas que corresponden al tipo de contribuyente.
 */
export function PanelPatrimonio({ empresaId, idPanel }: { empresaId: string; idPanel: string }) {
  const [filtros, setFiltros] = useState<FiltrosEstado>(() => ({ ...mesDe(), sucursalId: "", formato: "" }));
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const empresa = useQuery(empresaQuery(empresaId));
  const anexo = useAnexoNotas(empresaId, filtros);
  const errorFiltros = errorDeFiltros(filtros);
  const estado = useQuery({ ...cambiosPatrimonioQuery(empresaId, filtros), enabled: !errorFiltros });

  const alcance = sucursales.data?.find((s) => s.id === filtros.sucursalId)?.nombre ?? R.consolidado;
  const d = estado.data;

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
            <>
              <ExportarEstado
                documento={documentoCambiosPatrimonio(d)}
                empresa={empresa.data}
                alcance={alcance}
                anexo={anexo}
              />
              <BotonFirmarEstado
                empresaId={empresaId}
                documento={documentoCambiosPatrimonio(d)}
                alcance={alcance}
              />
            </>
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

      {d && !estado.isError && (
        <Card className={cn("overflow-hidden", estado.isFetching && "opacity-60")}>
          <EncabezadoReporte
            empresaId={empresaId}
            titulo={d.titulo}
            periodo={P.periodo(formatearFecha(d.desde), formatearFecha(d.hasta))}
            alcance={`${alcance} · ${P.enDolares}`}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{P.concepto}</TableHead>
                {d.columnas.map((c) => (
                  <TableHead key={c.id} className="text-right">
                    {c.titulo}
                  </TableHead>
                ))}
                <TableHead className="text-right">{P.total}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.renglones.map((r) => {
                const fuerte = r.id === "saldo-inicial" || r.id === "saldo-final";
                return (
                  <TableRow key={r.id} className={cn(fuerte && "bg-secondary/60 font-bold")}>
                    <TableCell>{r.concepto}</TableCell>
                    {r.valores.map((v, i) => (
                      <TableCell key={d.columnas[i]?.id} className="text-right tabular-nums">
                        {monto(v)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">{monto(r.total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
            {P.coincide(formatearDinero(d.patrimonioFinal))}
          </p>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        {P.nota} {estado.data?.tipoContribuyente === "sociedad" && P.notaSociedad} {R.nota}
      </p>
    </div>
  );
}
