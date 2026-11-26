import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearFecha } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { EncabezadoReporte } from "@/modules/reportes/comun/encabezado-reporte";
import { FiltrosDeReporte } from "@/modules/reportes/comun/filtros-reporte";
import { errorDeFiltros, mesDe, type FiltrosReporte } from "@/modules/reportes/comun/periodo";
import { Pestanas } from "@/modules/reportes/comun/pestanas";
import { TEXTOS_REPORTES as R } from "@/modules/reportes/comun/textos";
import { ExportarLibro } from "./exportar-libro";
import { libroComprasTabular } from "./libro-compras";
import { libroConsumidorTabular } from "./libro-consumidor";
import { libroContribuyentesTabular } from "./libro-contribuyentes";
import {
  libroComprasQuery,
  libroConsumidorQuery,
  libroContribuyentesQuery,
  type LibroIva,
} from "./libros-iva-api";
import { TablaLibro } from "./tabla-libro";
import { TEXTOS_LIBROS_IVA as T } from "./textos";

const OPCIONES: { valor: LibroIva; texto: string }[] = [
  { valor: "compras", texto: T.pestanas.compras },
  { valor: "contribuyentes", texto: T.pestanas.contribuyentes },
  { valor: "consumidor", texto: T.pestanas.consumidor },
];

/** Libros de IVA del Art. 141: compras, ventas a contribuyentes y ventas a consumidor final (HU-45, HU-46 y HU-47). */
export function PantallaLibrosIva({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("iva.ver");
  const [libroActivo, setLibroActivo] = useState<LibroIva>("compras");
  const [filtros, setFiltros] = useState<FiltrosReporte>(() => ({ ...mesDe(), sucursalId: "" }));

  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const empresa = useQuery({ ...empresaQuery(empresaId), enabled: puedeVer });
  const errorFiltros = errorDeFiltros(filtros);
  const habilitada = puedeVer && !errorFiltros;
  const compras = useQuery({
    ...libroComprasQuery(empresaId, filtros),
    enabled: habilitada && libroActivo === "compras",
  });
  const contribuyentes = useQuery({
    ...libroContribuyentesQuery(empresaId, filtros),
    enabled: habilitada && libroActivo === "contribuyentes",
  });
  const consumidor = useQuery({
    ...libroConsumidorQuery(empresaId, filtros),
    enabled: habilitada && libroActivo === "consumidor",
  });
  const consulta = { compras, contribuyentes, consumidor }[libroActivo];

  const alcance = sucursales.data?.find((s) => s.id === filtros.sucursalId)?.nombre ?? R.consolidado;
  const libro =
    libroActivo === "compras"
      ? compras.data && libroComprasTabular(compras.data)
      : libroActivo === "contribuyentes"
        ? contribuyentes.data && libroContribuyentesTabular(contribuyentes.data)
        : consumidor.data && libroConsumidorTabular(consumidor.data);

  return (
    <Pagina className="max-w-[1400px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />

      {!puedeVer ? (
        <Alert>{R.sinPermiso}</Alert>
      ) : (
        <>
          <FiltrosDeReporte
            valor={filtros}
            onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
            sucursales={sucursales.data ?? []}
            acciones={
              <ExportarLibro
                libro={libro}
                nombreArchivo={libroActivo}
                datos={{
                  empresa: empresa.data?.nombreComercial ?? empresa.data?.nombre ?? "",
                  alcance,
                  nrc: empresa.data?.nrc ?? null,
                }}
                deshabilitado={!libro || consulta.isFetching || Boolean(errorFiltros) || consulta.isError}
              />
            }
          />
          <Pestanas
            etiqueta={T.libros}
            valor={libroActivo}
            opciones={OPCIONES}
            onCambio={setLibroActivo}
            idPanel="panel-libro-iva"
          />

          <div
            id="panel-libro-iva"
            role="tabpanel"
            aria-labelledby={`pestana-${libroActivo}`}
            className="grid gap-5"
          >
            {consulta.isFetching && !libro && (
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
            {libro && !consulta.isError && (
              <Card className="overflow-hidden">
                <EncabezadoReporte
                  empresaId={empresaId}
                  titulo={libro.titulo}
                  periodo={`${formatearFecha(libro.desde)} al ${formatearFecha(libro.hasta)}`}
                  alcance={`${alcance} · ${T.enDolares}`}
                />
                <div className="overflow-x-auto">
                  <TablaLibro libro={libro} />
                </div>
              </Card>
            )}
            <p className="text-xs text-muted-foreground">{T.nota}</p>
          </div>
        </>
      )}
    </Pagina>
  );
}
