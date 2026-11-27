import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { estadoComparableSchema, NOMBRES_ESTADOS, type EstadoComparable } from "@contable/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, hoyIso } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermisos } from "@/modules/organizacion/permisos";
import { EncabezadoReporte } from "../comun/encabezado-reporte";
import { mesDe } from "../comun/periodo";
import { SelectorFormato } from "../comun/selector-formato";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { ExportarEstado } from "../exportacion/exportar-estado";
import { BotonFirmarEstado } from "../firma/boton-firmar-estado";
import { comparativoQuery, type FiltrosComparativo } from "./comparativo-api";
import { documentoComparativo, etiquetaPeriodo, textoPorcentaje } from "./documento-comparativo";
import { TEXTOS_ESTADOS_ADICIONALES as T } from "./textos";

const C = T.comparativo;
const monto = (valor: string) => formatearDinero(valor, { simbolo: false });

/** Mes anterior al de la fecha dada, como período (AAAA-MM-DD). */
function mesAnterior(fecha: string) {
  const [anio, mes] = fecha.split("-").map(Number) as [number, number];
  return mesDe(new Date(Date.UTC(anio, mes - 2, 1)).toISOString().slice(0, 10));
}

/** Error de las fechas del comparativo, o undefined si se puede consultar. */
function errorDeFechas(f: FiltrosComparativo): string | undefined {
  if (!f.hastaA || !f.hastaB) return C.errorFecha;
  if (f.estado === "balance-general") return undefined;
  if (!f.desdeA || !f.desdeB) return C.errorFecha;
  if (f.desdeA > f.hastaA || f.desdeB > f.hastaB) return C.errorRango;
  return undefined;
}

/**
 * Estados comparativos (S3-T29, HU-43): el estado de resultados o el balance general de dos períodos lado a
 * lado, con la variación en dólares y en porcentaje.
 */
export function PanelComparativo({ empresaId, idPanel }: { empresaId: string; idPanel: string }) {
  const permisos = usePermisos();
  const [filtros, setFiltros] = useState<FiltrosComparativo>(() => {
    const hoy = hoyIso();
    const a = mesDe(hoy);
    const b = mesAnterior(hoy);
    return {
      estado: "resultados",
      desdeA: a.desde,
      hastaA: a.hasta,
      desdeB: b.desde,
      hastaB: b.hasta,
      sucursalId: "",
      formato: "",
    };
  });
  const cambiar = (c: Partial<FiltrosComparativo>) => setFiltros((f) => ({ ...f, ...c }));

  const sucursales = useQuery(sucursalesQuery(empresaId));
  const empresa = useQuery(empresaQuery(empresaId));
  const error = errorDeFechas(filtros);
  const comparativo = useQuery({ ...comparativoQuery(empresaId, filtros), enabled: !error });
  const d = comparativo.data;

  const disponibles = (sucursales.data ?? []).filter(
    (s) => permisos.todasSucursales || permisos.sucursales.includes(s.id),
  );
  const alcance = sucursales.data?.find((s) => s.id === filtros.sucursalId)?.nombre ?? R.consolidado;
  const nombres = NOMBRES_ESTADOS[d?.formato ?? "clase"];
  const esBalance = filtros.estado === "balance-general";
  const hayPorcentajeSinBase = d?.filas.some((f) => f.tipo !== "seccion" && f.porcentaje === null);

  const fechas = (
    letra: "A" | "B",
    etiqueta: string,
    desde: "desdeA" | "desdeB",
    hasta: "hastaA" | "hastaB",
  ) => (
    <fieldset className="flex flex-wrap items-start gap-3">
      <legend className="sr-only">{etiqueta}</legend>
      {!esBalance && (
        <Field className="w-[160px]" data-invalid={Boolean(error)}>
          <FieldLabel htmlFor={`comparativo-${desde}`}>{`${etiqueta}: ${C.desde}`}</FieldLabel>
          <Input
            id={`comparativo-${desde}`}
            type="date"
            className="h-10 tabular-nums"
            value={filtros[desde]}
            onChange={(e) => cambiar({ [desde]: e.target.value })}
          />
        </Field>
      )}
      <Field className="w-[160px]" data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`comparativo-${hasta}`}>
          {esBalance ? `${letra === "A" ? C.fechaA : C.fechaB}` : `${etiqueta}: ${C.hasta}`}
        </FieldLabel>
        <Input
          id={`comparativo-${hasta}`}
          type="date"
          className="h-10 tabular-nums"
          value={filtros[hasta]}
          onChange={(e) => cambiar({ [hasta]: e.target.value })}
        />
      </Field>
    </fieldset>
  );

  return (
    <div id={idPanel} role="tabpanel" className="grid gap-4">
      <Card className="p-4">
        <h2 className="sr-only">{C.filtros}</h2>
        <div className="flex flex-wrap items-start gap-3">
          <Field className="w-full sm:w-[200px]">
            <FieldLabel htmlFor="comparativo-estado">{C.estado}</FieldLabel>
            <NativeSelect
              id="comparativo-estado"
              className="h-10"
              value={filtros.estado}
              onChange={(e) => cambiar({ estado: estadoComparableSchema.parse(e.target.value) })}
            >
              {estadoComparableSchema.options.map((o: EstadoComparable) => (
                <option key={o} value={o}>
                  {o === "resultados" ? nombres.resultados.titulo : nombres.balance.titulo}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {fechas("A", C.periodoA, "desdeA", "hastaA")}
          {fechas("B", C.periodoB, "desdeB", "hastaB")}
          <Field className="w-full sm:w-[220px]">
            <FieldLabel htmlFor="comparativo-sucursal">{R.filtros.sucursal}</FieldLabel>
            <NativeSelect
              id="comparativo-sucursal"
              className="h-10"
              value={filtros.sucursalId}
              onChange={(e) => cambiar({ sucursalId: e.target.value })}
            >
              <option value="">{R.filtros.consolidado}</option>
              {disponibles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <SelectorFormato
            id="comparativo-formato"
            valor={filtros.formato}
            actual={d?.formato}
            onCambio={(formato) => cambiar({ formato })}
          />
          {d && empresa.data && (
            <div className="ml-auto flex items-end">
              <>
                <ExportarEstado
                  documento={documentoComparativo(d)}
                  empresa={empresa.data}
                  alcance={alcance}
                />
                <BotonFirmarEstado
                  empresaId={empresaId}
                  documento={documentoComparativo(d)}
                  alcance={alcance}
                />
              </>
            </div>
          )}
        </div>
        {error && (
          <FieldError id="comparativo-error" className="mt-2">
            {error}
          </FieldError>
        )}
      </Card>

      {comparativo.isFetching && !d && (
        <p role="status" className="text-muted-foreground">
          {R.cargando}
        </p>
      )}
      {comparativo.isError && (
        <Alert variant="error">
          <p>
            {R.error} {mensajeDeError(comparativo.error)}
          </p>
          {!(comparativo.error instanceof ErrorApi && comparativo.error.estado === 403) && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void comparativo.refetch()}>
              {R.reintentar}
            </Button>
          )}
        </Alert>
      )}

      {d && !comparativo.isError && !error && (
        <Card className={cn("overflow-hidden", comparativo.isFetching && "opacity-60")}>
          <EncabezadoReporte
            empresaId={empresaId}
            titulo={C.titulo(d.titulo)}
            periodo={C.frente(etiquetaPeriodo(d.periodoA), etiquetaPeriodo(d.periodoB))}
            alcance={alcance}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{C.concepto}</TableHead>
                <TableHead className="text-right">{etiquetaPeriodo(d.periodoA)}</TableHead>
                <TableHead className="text-right">{etiquetaPeriodo(d.periodoB)}</TableHead>
                <TableHead className="text-right">{C.variacion}</TableHead>
                <TableHead className="text-right">{C.variacionPorcentual}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.filas.map((f) => (
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
                    {f.codigo ? `${f.codigo} · ${f.texto}` : f.texto}
                  </TableCell>
                  {f.tipo === "seccion" ? (
                    <TableCell colSpan={4} />
                  ) : (
                    <>
                      <TableCell className="text-right tabular-nums">{monto(f.periodoA ?? "0.00")}</TableCell>
                      <TableCell className="text-right tabular-nums">{monto(f.periodoB ?? "0.00")}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {monto(f.variacion ?? "0.00")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {textoPorcentaje(f.porcentaje)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        {C.nota} {hayPorcentajeSinBase && C.sinBaseAviso} {R.nota}
      </p>
    </div>
  );
}
