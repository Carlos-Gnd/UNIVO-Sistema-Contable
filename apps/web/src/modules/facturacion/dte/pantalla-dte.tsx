import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FilePlus2, FileText, Receipt, Undo2 } from "lucide-react";
import { ESTADOS_DTE, TIPOS_DTE, type DteVista, type EstadoDte, type TipoDte } from "@contable/shared";
import { navegar } from "@/app/navegacion";
import type { Parametros } from "@/app/rutas";
import { Enlace } from "@/components/enlace";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { dtesQuery, SIN_FILTROS_DTE, type FiltrosDte } from "./dte-api";
import { FormularioNotaDte } from "./formulario-nota-dte";
import { FormularioVentaDte, type TipoVentaDte } from "./formulario-venta-dte";
import { TEXTOS_DTE as T } from "./textos";

/**
 * Facturación electrónica (HU-53 a HU-57): los DTE emitidos por la empresa con sus filtros y las acciones para
 * emitir una factura (S4-T05), un CCF (S4-T08) o una nota de crédito o débito (S4-T11). Cada documento se abre en
 * el visor de su representación gráfica (S4-T14).
 */
export function PantallaDte({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("dte.ver");
  const puedeEmitir = usePermiso("dte.emitir");
  const [filtros, setFiltros] = useState<FiltrosDte>(SIN_FILTROS_DTE);
  const [emitiendo, setEmitiendo] = useState<TipoVentaDte | null>(null);
  const [nota, setNota] = useState(false);
  const dtes = useQuery({ ...dtesQuery(empresaId, filtros), enabled: puedeVer });
  const hayFiltros = Object.values(filtros).some((v) => v !== "");
  const rutaDte = (id: string) => `/empresas/${encodeURIComponent(empresaId)}/dte/${encodeURIComponent(id)}`;
  const abrir = (dte: DteVista) => navegar(rutaDte(dte.id));
  const cambiar = (cambios: Partial<FiltrosDte>) => setFiltros((f) => ({ ...f, ...cambios }));

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeVer && puedeEmitir && (
          <>
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setNota(true)}>
              <Undo2 aria-hidden="true" />
              {T.acciones.nota}
            </Button>
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setEmitiendo("ccf")}>
              <FileText aria-hidden="true" />
              {T.acciones.ccf}
            </Button>
            <Button className="h-11 rounded-full px-5" onClick={() => setEmitiendo("factura")}>
              <FilePlus2 aria-hidden="true" />
              {T.acciones.factura}
            </Button>
          </>
        )}
      </EncabezadoPagina>

      {!puedeVer ? (
        <Alert>{T.sinPermiso}</Alert>
      ) : (
        <>
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1fr_1fr_1fr]">
            <Input
              type="search"
              aria-label={T.filtros.busqueda}
              placeholder={T.filtros.busqueda}
              className="h-10"
              value={filtros.busqueda}
              onChange={(e) => cambiar({ busqueda: e.target.value })}
            />
            <NativeSelect
              aria-label={T.filtros.tipo}
              className="h-10"
              value={filtros.tipo}
              onChange={(e) => cambiar({ tipo: e.target.value as TipoDte | "" })}
            >
              <option value="">{T.filtros.todosTipos}</option>
              {TIPOS_DTE.map((t) => (
                <option key={t} value={t}>
                  {t} · {T.tipos[t]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={T.filtros.estado}
              className="h-10"
              value={filtros.estado}
              onChange={(e) => cambiar({ estado: e.target.value as EstadoDte | "" })}
            >
              <option value="">{T.filtros.todosEstados}</option>
              {ESTADOS_DTE.map((e) => (
                <option key={e} value={e}>
                  {T.estados[e]}
                </option>
              ))}
            </NativeSelect>
            <Input
              type="date"
              aria-label={T.filtros.desde}
              className="h-10"
              value={filtros.desde}
              onChange={(e) => cambiar({ desde: e.target.value })}
            />
            <Input
              type="date"
              aria-label={T.filtros.hasta}
              className="h-10"
              value={filtros.hasta}
              onChange={(e) => cambiar({ hasta: e.target.value })}
            />
          </Card>

          {dtes.isPending && (
            <p role="status" className="text-muted-foreground">
              {T.cargando}
            </p>
          )}
          {dtes.isError && (
            <Alert variant="error">
              <p>
                {T.errorCarga} {mensajeDeError(dtes.error)}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void dtes.refetch()}>
                {T.reintentar}
              </Button>
            </Alert>
          )}
          {dtes.isSuccess && dtes.data.length === 0 && (
            <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
              <Receipt aria-hidden="true" className="size-8" />
              <p>{hayFiltros ? T.sinResultados : T.vacio}</p>
            </Card>
          )}
          {dtes.isSuccess && dtes.data.length > 0 && (
            <Card className="overflow-hidden">
              <Table aria-label={T.titulo}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{T.columnas.fecha}</TableHead>
                    <TableHead>{T.columnas.tipo}</TableHead>
                    <TableHead>{T.columnas.numeroControl}</TableHead>
                    <TableHead>{T.columnas.receptor}</TableHead>
                    <TableHead className="text-right">{T.columnas.iva}</TableHead>
                    <TableHead className="text-right">{T.columnas.total}</TableHead>
                    <TableHead>{T.columnas.estado}</TableHead>
                    <TableHead className="text-right">{T.columnas.acciones}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dtes.data.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatearFecha(d.fechaEmision)}
                        <span className="block text-xs text-muted-foreground">{d.horaEmision}</span>
                      </TableCell>
                      <TableCell title={T.tipos[d.tipoDte]}>{T.tiposCortos[d.tipoDte]}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <Enlace
                          href={rutaDte(d.id)}
                          className="text-foreground underline-offset-4 hover:underline"
                        >
                          {d.numeroControl}
                        </Enlace>
                        {d.relacionado && (
                          <span className="block text-muted-foreground">
                            {T.corrige(d.relacionado.numeroControl)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{d.receptor ?? T.consumidorFinal}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearDinero(d.iva)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearDinero(d.total)}</TableCell>
                      <TableCell>
                        <Badge variant={d.estado === "invalidado" ? "neutra" : "solida"}>
                          {T.estados[d.estado]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full text-muted-foreground"
                          aria-label={T.ver(d.numeroControl)}
                          onClick={() => navegar(rutaDte(d.id))}
                        >
                          <Eye aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <FormularioVentaDte
        empresaId={empresaId}
        tipo={emitiendo}
        onCerrar={() => setEmitiendo(null)}
        onEmitido={abrir}
      />
      <FormularioNotaDte
        empresaId={empresaId}
        abierto={nota}
        onCerrar={() => setNota(false)}
        onEmitida={abrir}
      />
    </Pagina>
  );
}
