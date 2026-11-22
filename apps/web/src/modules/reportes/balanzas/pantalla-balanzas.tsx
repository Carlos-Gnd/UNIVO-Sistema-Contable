import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dinero, TIPOS_BALANZA, type TipoBalanza } from "@contable/shared";
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
import { Pestanas } from "../comun/pestanas";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { balanzaQuery } from "./balanzas-api";
import { TablaBalanza } from "./tabla-balanza";
import { TEXTOS_BALANZAS as T } from "./textos";

const OPCIONES = TIPOS_BALANZA.map((valor) => ({ valor, texto: T.tipo[valor].nombre }));

/** Balanzas de comprobación (antes de ajustes, ajustada y posterior al cierre), por sucursal o consolidada (HU-30, S2-T30). */
export function PantallaBalanzas({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("reportes.ver");
  const [tipo, setTipo] = useState<TipoBalanza>("antes-ajustes");
  const [filtros, setFiltros] = useState<FiltrosReporte>(() => ({ ...mesDe(), sucursalId: "" }));

  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const errorFiltros = errorDeFiltros(filtros);
  const balanza = useQuery({
    ...balanzaQuery(empresaId, { tipo, ...filtros }),
    enabled: puedeVer && !errorFiltros,
  });

  const sucursal = sucursales.data?.find((s) => s.id === filtros.sucursalId);
  const alcance = sucursal?.nombre ?? R.consolidado;
  const d = balanza.data;

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
          <Pestanas
            etiqueta={T.tipos}
            valor={tipo}
            opciones={OPCIONES}
            onCambio={setTipo}
            idPanel="panel-balanza"
          />

          <div id="panel-balanza" role="tabpanel" aria-labelledby={`pestana-${tipo}`} className="grid gap-5">
            {balanza.isFetching && !d && (
              <p role="status" className="text-muted-foreground">
                {R.cargando}
              </p>
            )}
            {balanza.isError && (
              <Alert variant="error">
                <p>
                  {R.error} {mensajeDeError(balanza.error)}
                </p>
                {!(balanza.error instanceof ErrorApi && balanza.error.estado === 403) && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => void balanza.refetch()}>
                    {R.reintentar}
                  </Button>
                )}
              </Alert>
            )}

            {d && !balanza.isError && (
              <>
                <IndicadorCuadre
                  cuadra={d.cuadra}
                  etiqueta={T.cuadre.etiqueta}
                  diferencias={[
                    { etiqueta: T.cuadre.saldoInicial, monto: d.diferencias.saldoInicial },
                    { etiqueta: T.cuadre.movimientos, monto: d.diferencias.movimientos },
                    { etiqueta: T.cuadre.saldoFinal, monto: d.diferencias.saldoFinal },
                  ]
                    .filter((x) => !Dinero.de(x.monto).esCero())
                    .map((x) => ({ ...x, monto: formatearDinero(x.monto) }))}
                />
                <Card className="overflow-hidden">
                  <EncabezadoReporte
                    empresaId={empresaId}
                    titulo={d.titulo}
                    periodo={`${formatearFecha(d.desde)} al ${formatearFecha(d.hasta)}`}
                    alcance={alcance}
                  />
                  <div className="overflow-x-auto">
                    <TablaBalanza balanza={d} />
                  </div>
                </Card>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {T.tipo[tipo].detalle} {R.nota}
            </p>
          </div>
        </>
      )}
    </Pagina>
  );
}
