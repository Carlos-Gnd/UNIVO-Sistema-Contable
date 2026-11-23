import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dinero } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { EncabezadoReporte } from "../comun/encabezado-reporte";
import { FiltrosDeReporte } from "../comun/filtros-reporte";
import { IndicadorCuadre } from "../comun/indicador-cuadre";
import { errorDeFiltros, mesDe, type FiltrosReporte } from "../comun/periodo";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { hojaTrabajoQuery } from "./hoja-trabajo-api";
import { TablaHojaTrabajo } from "./tabla-hoja-trabajo";
import { TEXTOS_HOJA_TRABAJO as T } from "./textos-pantalla";

/** Hoja de trabajo de diez columnas, por sucursal o consolidada (HU-31, S2-T34). */
export function PantallaHojaTrabajo({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("reportes.ver");
  const [filtros, setFiltros] = useState<FiltrosReporte>(() => ({ ...mesDe(), sucursalId: "" }));

  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const errorFiltros = errorDeFiltros(filtros);
  const consulta = useQuery({
    ...hojaTrabajoQuery(empresaId, filtros),
    enabled: puedeVer && !errorFiltros,
  });

  const sucursal = sucursales.data?.find((s) => s.id === filtros.sucursalId);
  const alcance = sucursal?.nombre ?? R.consolidado;
  const d = consulta.data;
  const D = T.cuadre;

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />

      {!puedeVer ? (
        <Alert>{R.sinPermiso}</Alert>
      ) : (
        <>
          <FiltrosDeReporte
            valor={filtros}
            onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
            sucursales={sucursales.data ?? []}
          />

          <div className="grid gap-5">
            {consulta.isFetching && !d && (
              <p role="status" className="text-muted-foreground">
                {R.cargando}
              </p>
            )}
            {consulta.isError && (
              <Alert variant="error">
                <p>
                  {R.error} {mensajeDeError(consulta.error)}
                </p>
                {!(consulta.error instanceof ErrorApi && consulta.error.estado === 403) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void consulta.refetch()}
                  >
                    {R.reintentar}
                  </Button>
                )}
              </Alert>
            )}

            {d && !consulta.isError && (
              <>
                <IndicadorCuadre
                  cuadra={d.cuadra}
                  etiqueta={D.etiqueta}
                  diferencias={[
                    { etiqueta: D.balanza, monto: d.diferencias.balanza },
                    { etiqueta: D.ajustes, monto: d.diferencias.ajustes },
                    { etiqueta: D.balanzaAjustada, monto: d.diferencias.balanzaAjustada },
                    { etiqueta: D.estadoResultados, monto: d.diferencias.estadoResultados },
                    { etiqueta: D.balanceGeneral, monto: d.diferencias.balanceGeneral },
                  ]
                    .filter((x) => !Dinero.de(x.monto).esCero())
                    .map((x) => ({ ...x, monto: formatearDinero(x.monto) }))}
                />
                {d.cuadra && d.resultado.tipo && (
                  <p className="text-sm text-muted-foreground">
                    {(d.resultado.tipo === "utilidad" ? T.utilidad : T.perdida)(
                      formatearDinero(d.resultado.monto),
                    )}
                  </p>
                )}
                <Card className="overflow-hidden">
                  <EncabezadoReporte
                    empresaId={empresaId}
                    titulo={T.tituloReporte}
                    periodo={`${formatearFecha(d.desde)} al ${formatearFecha(d.hasta)}`}
                    alcance={alcance}
                  />
                  <TablaHojaTrabajo hoja={d} />
                </Card>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {T.nota} {R.nota}
            </p>
          </div>
        </>
      )}
    </Pagina>
  );
}
