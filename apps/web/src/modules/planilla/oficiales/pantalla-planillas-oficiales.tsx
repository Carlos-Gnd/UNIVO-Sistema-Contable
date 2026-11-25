import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dinero, type TipoPlanillaOficial } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import {
  crearExcelPlanillaOficial,
  descargarExcelPlanillaOficial,
  imprimirPlanillaOficial,
} from "./exportar";
import { planillasOficialesQuery, usePresentarPlanillaOficial } from "./planillas-oficiales-api";
import { TEXTOS_PLANILLAS_OFICIALES as T } from "./textos";

type TabPlanilla = TipoPlanillaOficial;

export function PantallaPlanillasOficiales({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const [periodo, setPeriodo] = useState(hoyIso().slice(0, 7));
  const [tab, setTab] = useState<TabPlanilla>("isss");
  const puedePresentar = usePermiso("planilla.calcular");
  const consulta = useQuery(planillasOficialesQuery(empresaId, periodo));
  const presentar = usePresentarPlanillaOficial(empresaId);
  const reporte = consulta.data;
  const presentacion = reporte?.presentaciones[tab];
  const totales = reporte?.totales[tab];

  async function generarExcel() {
    if (!reporte) return;
    try {
      const blob = await crearExcelPlanillaOficial(tab, reporte);
      descargarExcelPlanillaOficial(blob, tab, periodo);
    } catch {
      toast.error(T.errorExportacion);
    }
  }

  async function registrarPresentacion() {
    presentar.mutate({ periodo, tipo: tab }, { onError: () => toast.error(T.errorPresentacion) });
  }

  return (
    <Pagina className="max-w-[1440px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      <Card className="grid gap-4 p-4 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium">
          {T.periodo}
          <Input
            aria-label={T.periodo}
            type="month"
            value={periodo}
            onChange={(evento) => setPeriodo(evento.target.value)}
            className="h-10 max-w-xs"
          />
        </label>
        <p role="status" className="text-sm font-medium text-muted-foreground">
          {presentacion
            ? T.estadoPresentada(
                formatearFecha(hoyIso(new Date(presentacion.presentadaEn))),
                presentacion.presentadaPor,
              )
            : T.estadoPendiente}
        </p>
      </Card>

      <div role="tablist" aria-label={T.titulo} className="flex gap-2 border-b">
        {(["isss", "afp"] as const).map((tipo) => (
          <button
            key={tipo}
            type="button"
            role="tab"
            aria-selected={tab === tipo}
            className={`border-b-2 px-4 py-2 font-medium ${tab === tipo ? "border-primary" : "border-transparent text-muted-foreground"}`}
            onClick={() => setTab(tipo)}
          >
            {T.tabs[tipo]}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{T.formatoGenerico}</p>
      {consulta.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {consulta.isError && (
        <Alert variant="error">
          <p>
            {T.error} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {consulta.isSuccess && reporte && reporte.empleados.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">{T.vacio}</Card>
      )}
      {consulta.isSuccess && reporte && reporte.empleados.length > 0 && totales && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.empleado}</TableHead>
                <TableHead className="text-right">
                  {tab === "isss" ? T.columnas.salarioIsss : T.columnas.salarioAfp}
                </TableHead>
                <TableHead className="text-right">
                  {T.columnas[tab === "isss" ? "empleadoIsss" : "empleadoAfp"]}
                </TableHead>
                <TableHead className="text-right">
                  {T.columnas[tab === "isss" ? "patronoIsss" : "patronoAfp"]}
                </TableHead>
                <TableHead className="text-right">{T.columnas.total}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reporte.empleados.map((empleado) => {
                const laboral = tab === "isss" ? empleado.isssLaboral : empleado.afpLaboral;
                const patronal = tab === "isss" ? empleado.isssPatronal : empleado.afpPatronal;
                const importeTotal = Dinero.de(laboral).mas(patronal).aTexto();
                return (
                  <TableRow key={empleado.empleadoId}>
                    <TableCell className="font-medium">{empleado.nombreCompleto}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(empleado.salarioCotizable)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatearDinero(laboral)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearDinero(patronal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearDinero(importeTotal)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-semibold">
                <TableCell>{T.total}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearDinero(totales.salarioCotizable)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatearDinero(totales.laboral)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearDinero(totales.patronal)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatearDinero(totales.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      )}
      {reporte && reporte.empleados.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => void generarExcel()}>
            {T.generar(tab)}
          </Button>
          <Button variant="outline" onClick={() => imprimirPlanillaOficial(tab, reporte)}>
            {T.pdf}
          </Button>
          {puedePresentar && !presentacion && (
            <Button onClick={() => void registrarPresentacion()} disabled={presentar.isPending}>
              {presentar.isPending ? T.presentando : T.presentar}
            </Button>
          )}
        </div>
      )}
    </Pagina>
  );
}
