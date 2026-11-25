import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus, ShoppingCart } from "lucide-react";
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
import { comprasQuery, type FiltrosCompras } from "./compras-api";
import { DialogoCompra } from "./dialogo-compra";
import { FormularioCompra } from "./formulario-compra";
import { TEXTOS_COMPRAS as T } from "./textos";

/** Pantalla de compras (HU-59, S3-T62): lista del libro de compras y registro con partida automática. */
export function PantallaCompras({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeRegistrar = usePermiso("operaciones.registrar");
  const [filtros, setFiltros] = useState<FiltrosCompras>({ busqueda: "", desde: "", hasta: "" });
  const [registrando, setRegistrando] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);
  const compras = useQuery(comprasQuery(empresaId, filtros));
  const hayFiltros = filtros.busqueda !== "" || filtros.desde !== "" || filtros.hasta !== "";

  return (
    <Pagina className="max-w-[1120px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
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

      {compras.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {compras.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(compras.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void compras.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {compras.isSuccess && compras.data.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <ShoppingCart aria-hidden="true" className="size-8" />
          <p>{hayFiltros ? T.sinResultados : T.vacio}</p>
        </Card>
      )}
      {compras.isSuccess && compras.data.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.fecha}</TableHead>
                <TableHead>{T.columnas.documento}</TableHead>
                <TableHead>{T.columnas.proveedor}</TableHead>
                <TableHead>{T.columnas.pago}</TableHead>
                <TableHead className="text-right">{T.columnas.iva}</TableHead>
                <TableHead className="text-right">{T.columnas.total}</TableHead>
                <TableHead>{T.columnas.partida}</TableHead>
                <TableHead className="text-right">{T.columnas.acciones}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compras.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="tabular-nums whitespace-nowrap">{formatearFecha(c.fecha)}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {T.tiposDocumento[c.tipoDocumento]} {c.numeroDocumento}
                  </TableCell>
                  <TableCell>{c.tercero?.nombre}</TableCell>
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

      <FormularioCompra empresaId={empresaId} abierto={registrando} onCerrar={() => setRegistrando(false)} />
      <DialogoCompra empresaId={empresaId} documentoId={detalle} onCerrar={() => setDetalle(null)} />
    </Pagina>
  );
}
