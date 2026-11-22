import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import {
  Dinero,
  RENGLONES_POR_PAGINA_DIARIO,
  tipoPartidaSchema,
  type PaginaDiario,
  type RenglonDiario,
  type TipoPartida,
  type TotalesDiario,
} from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { EncabezadoReporte } from "../comun/encabezado-reporte";
import { FiltrosDeReporte } from "../comun/filtros-reporte";
import { IndicadorCuadre } from "../comun/indicador-cuadre";
import { errorDeFiltros, mesDe } from "../comun/periodo";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { libroDiarioQuery, type FiltrosLibroDiario } from "./libro-diario-api";
import { TEXTOS_LIBRO_DIARIO as T } from "./textos";

const TIPOS = tipoPartidaSchema.options;
const OPCIONES_RENGLONES = [20, 30, 40, 50, 100].filter(
  (n) => n >= RENGLONES_POR_PAGINA_DIARIO.minimo && n <= RENGLONES_POR_PAGINA_DIARIO.maximo,
);

const monto = (valor: string | null) => (valor === null ? "" : formatearDinero(valor, { simbolo: false }));

/**
 * Libro diario (S2-T17, HU-25): las partidas contabilizadas y anuladas del período en el formato de clase, con
 * filtros de fechas, tipo de partida y sucursal. Cada folio muestra lo que viene del anterior y lo que pasa al
 * siguiente, igual que el libro impreso.
 */
export function PantallaLibroDiario({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("reportes.ver");
  const [filtros, setFiltros] = useState<FiltrosLibroDiario>(() => ({
    ...mesDe(),
    sucursalId: "",
    tipo: "",
    renglonesPorPagina: RENGLONES_POR_PAGINA_DIARIO.porDefecto,
  }));
  const cambiar = (cambios: Partial<FiltrosLibroDiario>) => setFiltros((f) => ({ ...f, ...cambios }));

  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const errorFiltros = errorDeFiltros(filtros);
  const libro = useQuery({ ...libroDiarioQuery(empresaId, filtros), enabled: puedeVer && !errorFiltros });

  const sucursal = sucursales.data?.find((s) => s.id === filtros.sucursalId);
  const alcance = [sucursal?.nombre ?? R.consolidado, filtros.tipo && T.tipos[filtros.tipo]]
    .filter(Boolean)
    .join(" · ");
  const d = libro.data;

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />

      {!puedeVer ? (
        <Alert>{R.sinPermiso}</Alert>
      ) : (
        <>
          <FiltrosDeReporte valor={filtros} onCambio={cambiar} sucursales={sucursales.data ?? []} />
          <Card className="flex flex-wrap gap-3 p-4">
            <Field className="w-full sm:w-[220px]">
              <FieldLabel htmlFor="diario-tipo">{T.filtros.tipo}</FieldLabel>
              <NativeSelect
                id="diario-tipo"
                className="h-10"
                value={filtros.tipo}
                onChange={(e) => cambiar({ tipo: e.target.value as TipoPartida | "" })}
              >
                <option value="">{T.filtros.todosTipos}</option>
                {TIPOS.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {T.tipos[tipo]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field className="w-full sm:w-[180px]">
              <FieldLabel htmlFor="diario-renglones">{T.filtros.renglones}</FieldLabel>
              <NativeSelect
                id="diario-renglones"
                className="h-10"
                value={filtros.renglonesPorPagina}
                onChange={(e) => cambiar({ renglonesPorPagina: Number(e.target.value) })}
              >
                {OPCIONES_RENGLONES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </Card>

          {libro.isFetching && !d && (
            <p role="status" className="text-muted-foreground">
              {R.cargando}
            </p>
          )}
          {libro.isError && (
            <Alert variant="error">
              <p>
                {R.error} {mensajeDeError(libro.error)}
              </p>
              {!(libro.error instanceof ErrorApi && libro.error.estado === 403) && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void libro.refetch()}>
                  {R.reintentar}
                </Button>
              )}
            </Alert>
          )}

          {d && !libro.isError && (
            <>
              {d.partidas > 0 && (
                <IndicadorCuadre
                  cuadra={d.cuadra}
                  etiqueta={T.cuadre}
                  diferencias={[
                    {
                      etiqueta: T.totales,
                      monto: formatearDinero(Dinero.de(d.totales.debe).menos(d.totales.haber).abs()),
                    },
                  ]}
                />
              )}
              <Card className={cn("overflow-hidden", libro.isFetching && "opacity-60")}>
                <EncabezadoReporte
                  empresaId={empresaId}
                  titulo={T.tituloReporte}
                  periodo={`${formatearFecha(d.desde)} al ${formatearFecha(d.hasta)}`}
                  alcance={alcance}
                />
                {d.partidas === 0 ? (
                  <p className="p-10 text-center text-muted-foreground">{T.vacio}</p>
                ) : (
                  <>
                    <p className="border-b border-border px-5 py-2 text-sm text-muted-foreground">
                      {T.partidas(d.partidas)} · {T.folios(d.paginas.length)}
                    </p>
                    {d.paginas.map((pagina, i) => (
                      <Folio
                        key={pagina.folio}
                        pagina={pagina}
                        primero={i === 0}
                        ultimo={i === d.paginas.length - 1}
                      />
                    ))}
                  </>
                )}
              </Card>
            </>
          )}
          <p className="text-xs text-muted-foreground">{R.nota}</p>
        </>
      )}
    </Pagina>
  );
}

function FilaTotales({ etiqueta, totales }: { etiqueta: string; totales: TotalesDiario }) {
  return (
    <TableRow className="bg-secondary/60 font-semibold hover:bg-secondary/60">
      <TableCell colSpan={4} className="text-right">
        {etiqueta}
      </TableCell>
      <TableCell className="text-right tabular-nums">{monto(totales.debe)}</TableCell>
      <TableCell className="text-right tabular-nums">{monto(totales.haber)}</TableCell>
    </TableRow>
  );
}

/** Un folio del libro: Vienen (salvo el primero), sus renglones y Pasan (Totales en el último). */
function Folio({ pagina, primero, ultimo }: { pagina: PaginaDiario; primero: boolean; ultimo: boolean }) {
  return (
    <section aria-label={T.folio(pagina.folio)} className="border-b border-border last:border-0">
      <h3 className="px-5 pt-4 pb-2 text-right text-xs font-bold tracking-[.08em] text-muted-foreground uppercase">
        {T.folio(pagina.folio)}
      </h3>
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[110px]">{T.columnas.fecha}</TableHead>
            <TableHead className="w-[110px]">{T.columnas.codigo}</TableHead>
            <TableHead>{T.columnas.concepto}</TableHead>
            <TableHead className="w-[120px] text-right">{T.columnas.parcial}</TableHead>
            <TableHead className="w-[130px] text-right">{T.columnas.debe}</TableHead>
            <TableHead className="w-[130px] text-right">{T.columnas.haber}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!primero && <FilaTotales etiqueta={T.vienen} totales={pagina.vienen} />}
          {pagina.renglones.map((r, i) => (
            <Renglon key={`${r.partidaId}-${i}`} renglon={r} />
          ))}
          <FilaTotales etiqueta={ultimo ? T.totales : T.pasan} totales={pagina.pasan} />
        </TableBody>
      </Table>
    </section>
  );
}

function Renglon({ renglon: r }: { renglon: RenglonDiario }) {
  if (r.tipo === "partida") {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell className="pt-4 tabular-nums">{r.fecha ? formatearFecha(r.fecha) : ""}</TableCell>
        <TableCell colSpan={5} className="pt-4 text-center font-semibold">
          {r.descripcion}
        </TableCell>
      </TableRow>
    );
  }
  if (r.tipo === "concepto") {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell />
        <TableCell />
        <TableCell colSpan={4} className="pb-4 text-muted-foreground italic">
          {r.descripcion}
        </TableCell>
      </TableRow>
    );
  }
  const subcuenta = r.tipo === "subcuenta";
  // Las cuentas abonadas se escriben con sangría, como en el libro de clase
  const abono = r.tipo === "cuenta" && r.haber !== null && r.debe === null;
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell />
      <TableCell className={cn("tabular-nums", subcuenta && "text-muted-foreground")}>{r.codigo}</TableCell>
      <TableCell className={cn(subcuenta && "pl-8 text-muted-foreground", abono && "pl-10")}>
        {r.descripcion}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{monto(r.parcial)}</TableCell>
      <TableCell className="text-right tabular-nums">{monto(r.debe)}</TableCell>
      <TableCell className="text-right tabular-nums">{monto(r.haber)}</TableCell>
    </TableRow>
  );
}
