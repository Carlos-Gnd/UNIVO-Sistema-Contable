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
import { compraQuery } from "./compras-api";
import { TEXTOS_COMPRAS } from "./textos";

const T = TEXTOS_COMPRAS.detalle;

interface Props {
  empresaId: string;
  documentoId: string | null;
  onCerrar: () => void;
}

/** Detalle de una compra registrada: líneas con su costo en el kardex, IVA y estado de su partida. */
export function DialogoCompra({ empresaId, documentoId, onCerrar }: Props) {
  const documento = useQuery({ ...compraQuery(empresaId, documentoId ?? ""), enabled: documentoId !== null });
  const d = documento.data;
  return (
    <Dialog open={documentoId !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d ? T.titulo(d.numeroDocumento) : TEXTOS_COMPRAS.cargando}</DialogTitle>
          <DialogDescription>
            {d && `${TEXTOS_COMPRAS.tiposDocumento[d.tipoDocumento]} · ${T.fecha} ${formatearFecha(d.fecha)}`}
          </DialogDescription>
        </DialogHeader>
        {documento.isError && <Alert variant="error">{mensajeDeError(documento.error)}</Alert>}
        {d && (
          <div className="grid gap-4">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{T.proveedor}</dt>
                <dd>{d.tercero?.nombre ?? T.sinDato}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{T.pago}</dt>
                <dd>
                  {TEXTOS_COMPRAS.pago[d.condicionPago]}
                  {d.fechaVencimiento && ` · ${TEXTOS_COMPRAS.vence(formatearFecha(d.fechaVencimiento))}`}
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
              {T.partida}: {TEXTOS_COMPRAS.estadoPartida[d.estadoPartida]}
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
