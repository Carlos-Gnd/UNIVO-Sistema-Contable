import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { ventaQuery } from "./ventas-api";
import { TEXTOS_VENTAS } from "./textos";

const T = TEXTOS_VENTAS.detalle;

interface Props {
  empresaId: string;
  documentoId: string | null;
  onCerrar: () => void;
}

/** Detalle de una venta registrada: líneas con su costo de ventas del kardex, IVA y estado de su partida. */
export function DialogoVenta({ empresaId, documentoId, onCerrar }: Props) {
  const documento = useQuery({ ...ventaQuery(empresaId, documentoId ?? ""), enabled: documentoId !== null });
  const d = documento.data;
  return (
    <Dialog open={documentoId !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d ? T.titulo(d.numeroDocumento) : TEXTOS_VENTAS.cargando}</DialogTitle>
          <DialogDescription>
            {d && `${TEXTOS_VENTAS.tiposDocumento[d.tipoDocumento]} · ${T.fecha} ${formatearFecha(d.fecha)}`}
          </DialogDescription>
        </DialogHeader>
        {documento.isError && <Alert variant="error">{mensajeDeError(documento.error)}</Alert>}
        {d && (
          <div className="grid gap-4">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{T.cliente}</dt>
                <dd>{d.tercero?.nombre ?? TEXTOS_VENTAS.consumidorFinal}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{T.pago}</dt>
                <dd>
                  {TEXTOS_VENTAS.pago[d.condicionPago]}
                  {d.fechaVencimiento && ` · ${TEXTOS_VENTAS.vence(formatearFecha(d.fechaVencimiento))}`}
                </dd>
              </div>
            </dl>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.producto}</TableHead>
                  <TableHead className="text-right">{T.cantidad}</TableHead>
                  <TableHead className="text-right">{T.precio}</TableHead>
                  <TableHead className="text-right">{T.monto}</TableHead>
                  <TableHead className="text-right">{T.costo}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.lineas.map((l) => (
                  <TableRow key={l.orden}>
                    <TableCell>
                      {l.productoCodigo ? `${l.productoCodigo} · ${l.descripcion}` : l.descripcion}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.cantidad)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(l.precioUnitario)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatearDinero(l.monto)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.costoKardex ? formatearDinero(l.costoKardex) : T.sinDato}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
              <Cifra etiqueta={T.gravado} valor={d.totalGravado} />
              <Cifra etiqueta={T.exento} valor={d.totalExento} />
              <Cifra etiqueta={T.noSujeto} valor={d.totalNoSujeto} />
              <Cifra etiqueta={T.iva} valor={d.iva} />
              {d.ivaPercibido !== "0.00" && <Cifra etiqueta={T.percibido} valor={d.ivaPercibido} />}
              {d.ivaRetenido !== "0.00" && <Cifra etiqueta={T.retenido} valor={d.ivaRetenido} />}
              <Cifra etiqueta={T.total} valor={d.total} fuerte />
              <Cifra etiqueta={T.neto} valor={d.totalNeto} fuerte />
            </dl>
            <p className="text-sm text-muted-foreground">
              {T.partida}: {TEXTOS_VENTAS.estadoPartida[d.estadoPartida]}
              <br />
              {T.partidaCosto}: {d.partidaCostoId ? T.generada : T.sinPartidaCosto}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            {T.cerrar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cifra({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={fuerte ? "font-semibold tabular-nums" : "tabular-nums"}>{formatearDinero(valor)}</dd>
    </div>
  );
}
