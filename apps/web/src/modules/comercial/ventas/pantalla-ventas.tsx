import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus, ShoppingBag, Undo2 } from "lucide-react";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { ventasQuery, type FiltrosVentas } from "./ventas-api";
import { DialogoVenta } from "./dialogo-venta";
import { FormularioVenta } from "./formulario-venta";
import { FormularioNota } from "../notas/formulario-nota";
import { ListaNotas } from "../notas/lista-notas";
import { TEXTOS_NOTAS } from "../notas/textos";
import { TEXTOS_VENTAS as T } from "./textos";

/** Pantalla de ventas (HU-60, S3-T65): lista de ventas y registro con sus partidas automáticas. */
export function PantallaVentas({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeRegistrar = usePermiso("operaciones.registrar");
  const [filtros, setFiltros] = useState<FiltrosVentas>({ busqueda: "", desde: "", hasta: "" });
  const [registrando, setRegistrando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);
  const ventas = useQuery(ventasQuery(empresaId, filtros));
  const hayFiltros = filtros.busqueda !== "" || filtros.desde !== "" || filtros.hasta !== "";

  return (
    <Pagina className="max-w-[1120px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeRegistrar && (
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setCorrigiendo(true)}>
            <Undo2 aria-hidden="true" />
            {TEXTOS_NOTAS.boton}
          </Button>
        )}
        {puedeRegistrar && (
          <Button className="h-11 rounded-full px-5" onClick={() => setRegistrando(true)}>
            <Plus aria-hidden="true" />
            {T.nueva}
          </Button>
        )}
      </EncabezadoPagina>

      <Card className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Input
          type="search"
          aria-label={T.filtros.busqueda}
          placeholder={T.filtros.busqueda}
          className="h-10"
          value={filtros.busqueda}
          onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
        />
        <Input
          type="date"
          aria-label={T.filtros.desde}
          className="h-10"
          value={filtros.desde}
          onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
        />
        <Input
          type="date"
          aria-label={T.filtros.hasta}
          className="h-10"
          value={filtros.hasta}
          onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
        />
      </Card>

      {ventas.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {ventas.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(ventas.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void ventas.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {ventas.isSuccess && ventas.data.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <ShoppingBag aria-hidden="true" className="size-8" />
          <p>{hayFiltros ? T.sinResultados : T.vacio}</p>
        </Card>
      )}
      {ventas.isSuccess && ventas.data.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.fecha}</TableHead>
                <TableHead>{T.columnas.documento}</TableHead>
                <TableHead>{T.columnas.cliente}</TableHead>
                <TableHead>{T.columnas.pago}</TableHead>
                <TableHead className="text-right">{T.columnas.iva}</TableHead>
                <TableHead className="text-right">{T.columnas.total}</TableHead>
                <TableHead>{T.columnas.partida}</TableHead>
                <TableHead className="text-right">{T.columnas.acciones}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="tabular-nums whitespace-nowrap">{formatearFecha(c.fecha)}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {T.tiposDocumento[c.tipoDocumento]} {c.numeroDocumento}
                    {c.numeroDocumentoHasta && ` al ${c.numeroDocumentoHasta}`}
                  </TableCell>
                  <TableCell>{c.tercero?.nombre ?? T.consumidorFinal}</TableCell>
                  <TableCell>
                    {T.pago[c.condicionPago]}
                    {c.fechaVencimiento && (
                      <span className="block text-xs text-muted-foreground">
                        {T.vence(formatearFecha(c.fechaVencimiento))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatearDinero(c.iva)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearDinero(c.total)}</TableCell>
                  <TableCell>
                    <Badge variant={c.estadoPartida === "borrador" ? "neutra" : "solida"}>
                      {T.estadoPartida[c.estadoPartida]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-muted-foreground"
                      aria-label={T.verDetalle(c.numeroDocumento)}
                      onClick={() => setDetalle(c.id)}
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

      <ListaNotas empresaId={empresaId} operacion="venta" />

      <FormularioVenta empresaId={empresaId} abierto={registrando} onCerrar={() => setRegistrando(false)} />
      <FormularioNota
        empresaId={empresaId}
        operacion="venta"
        abierto={corrigiendo}
        onCerrar={() => setCorrigiendo(false)}
      />
      <DialogoVenta empresaId={empresaId} documentoId={detalle} onCerrar={() => setDetalle(null)} />
    </Pagina>
  );
}
