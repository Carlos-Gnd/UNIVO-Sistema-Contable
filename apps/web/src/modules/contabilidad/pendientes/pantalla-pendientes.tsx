import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PartidaVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Enlace } from "@/components/enlace";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { BarraContabilizarLote } from "../contabilizacion";
import { sucursalesQuery } from "../partidas/partidas-api";
import { ETIQUETA_TIPO_PARTIDA } from "../partidas/tipos";
import { borradoresQuery } from "./pendientes-api";

const TODAS = "";

/**
 * Bandeja de pendientes (S1-T83, HU-21): los borradores de las sucursales visibles con la diferencia entre
 * debe y haber. Quien puede contabilizar elige los que cuadran y los contabiliza por lote (HU-22).
 */
export function PantallaPendientes({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const { t } = useTranslation("pendientes");
  const borradores = useQuery(borradoresQuery(empresaId));
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const puedeContabilizar = usePermiso("partidas.contabilizar");
  const [sucursalId, setSucursalId] = useState(TODAS);
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());

  const nombresSucursal = new Map((sucursales.data ?? []).map((s) => [s.id, s.nombre]));
  const todas = borradores.data ?? [];
  const visibles = sucursalId === TODAS ? todas : todas.filter((p) => p.sucursalId === sucursalId);
  const seleccionables = visibles.filter((p) => p.cuadra);
  // Solo cuenta lo que sigue en pantalla: al filtrar o al contabilizar, lo que desaparece sale de la selección
  const seleccionadas = seleccionables.filter((p) => seleccion.has(p.id));
  const sucursalesConBorradores = (sucursales.data ?? []).filter((s) =>
    todas.some((p) => p.sucursalId === s.id),
  );

  const concepto = (p: PartidaVista) => p.concepto ?? t("sinConcepto");
  const urlPartida = (p: PartidaVista) =>
    `/empresas/${encodeURIComponent(empresaId)}/partidas/${encodeURIComponent(p.id)}`;

  function alternar(id: string, marcada: boolean) {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (marcada) nueva.add(id);
      else nueva.delete(id);
      return nueva;
    });
  }

  const todasMarcadas = seleccionables.length > 0 && seleccionadas.length === seleccionables.length;

  return (
    <Pagina>
      <EncabezadoPagina titulo={t("titulo")} descripcion={t("descripcion")}>
        <Button asChild className="h-11 rounded-full px-5">
          <Enlace href={`/empresas/${encodeURIComponent(empresaId)}/partidas/nueva`}>
            <Plus aria-hidden="true" />
            {t("nueva")}
          </Enlace>
        </Button>
      </EncabezadoPagina>

      {borradores.isPending && (
        <p role="status" className="text-muted-foreground">
          {t("cargando")}
        </p>
      )}
      {borradores.isError && (
        <Alert variant="error">
          <p>
            {t("errorCarga")} {mensajeDeError(borradores.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void borradores.refetch()}>
            {t("reintentar")}
          </Button>
        </Alert>
      )}

      {borradores.isSuccess && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4">
            <label className="grid gap-1 text-sm sm:w-64">
              <span className="font-medium">{t("sucursal")}</span>
              <NativeSelect
                className="h-10"
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
              >
                <option value={TODAS}>{t("todasSucursales")}</option>
                {sucursalesConBorradores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {visibles.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("resumen", {
                  count: visibles.length,
                  descuadradas: visibles.length - seleccionables.length,
                })}
              </p>
            )}
          </div>

          {visibles.length === 0 ? (
            <p className="p-10 text-center text-muted-foreground">
              {sucursalId === TODAS ? t("vacio") : t("vacioSucursal")}
            </p>
          ) : (
            <Table className="min-w-[860px]" aria-label={t("titulo")}>
              <TableHeader>
                <TableRow>
                  {puedeContabilizar && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label={t("seleccionarTodas")}
                        disabled={seleccionables.length === 0}
                        checked={todasMarcadas}
                        indeterminate={seleccionadas.length > 0 && !todasMarcadas}
                        onChange={(e) =>
                          setSeleccion(
                            e.target.checked ? new Set(seleccionables.map((p) => p.id)) : new Set(),
                          )
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead>{t("columnas.fecha")}</TableHead>
                  <TableHead>{t("columnas.tipo")}</TableHead>
                  <TableHead>{t("columnas.concepto")}</TableHead>
                  <TableHead>{t("columnas.sucursal")}</TableHead>
                  <TableHead className="text-right">{t("columnas.debe")}</TableHead>
                  <TableHead className="text-right">{t("columnas.haber")}</TableHead>
                  <TableHead>{t("columnas.estado")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((p) => (
                  <TableRow key={p.id} data-state={seleccion.has(p.id) ? "selected" : undefined}>
                    {puedeContabilizar && (
                      <TableCell>
                        <Checkbox
                          aria-label={t("seleccionar", { concepto: concepto(p) })}
                          title={p.cuadra ? undefined : t("noSeleccionable")}
                          disabled={!p.cuadra}
                          checked={p.cuadra && seleccion.has(p.id)}
                          onChange={(e) => alternar(p.id, e.target.checked)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatearFecha(p.fecha)}
                    </TableCell>
                    <TableCell>{ETIQUETA_TIPO_PARTIDA[p.tipo]}</TableCell>
                    <TableCell className="max-w-[320px]">
                      <Enlace
                        href={urlPartida(p)}
                        aria-label={t("abrir", { concepto: concepto(p) })}
                        className="block truncate text-foreground underline-offset-4 hover:underline"
                      >
                        {concepto(p)}
                      </Enlace>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {nombresSucursal.get(p.sucursalId) ?? ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(p.totalDebe, { simbolo: false })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(p.totalHaber, { simbolo: false })}
                    </TableCell>
                    <TableCell>
                      {p.cuadra ? (
                        <Badge variant="contorno">{t("cuadra")}</Badge>
                      ) : (
                        <Badge variant="alerta">
                          {t("diferencia", { monto: formatearDinero(p.diferencia) })}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <BarraContabilizarLote
        empresaId={empresaId}
        seleccion={seleccionadas}
        onQuitarSeleccion={() => setSeleccion(new Set())}
        onContabilizadas={(ids) =>
          setSeleccion((actual) => new Set([...actual].filter((id) => !ids.includes(id))))
        }
      />
    </Pagina>
  );
}
