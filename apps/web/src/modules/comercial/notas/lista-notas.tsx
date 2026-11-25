import { useQuery } from "@tanstack/react-query";
import type { OperacionComercial } from "@contable/shared";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { notasQuery } from "./notas-api";
import { TEXTOS_NOTAS as T } from "./textos";

/** Notas de crédito y de débito registradas sobre las compras o las ventas (HU-61). */
export function ListaNotas({ empresaId, operacion }: { empresaId: string; operacion: OperacionComercial }) {
  const notas = useQuery(notasQuery(empresaId, operacion));
  if (notas.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {T.cargando}
      </p>
    );
  }
  if (notas.isError) {
    return (
      <Alert variant="error">
        <p>
          {T.errorCarga} {mensajeDeError(notas.error)}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void notas.refetch()}>
          {T.reintentar}
        </Button>
      </Alert>
    );
  }
  return (
    <section aria-labelledby="titulo-notas" className="grid gap-3">
      <h2 id="titulo-notas" className="text-base font-semibold">
        {T.titulo}
      </h2>
      {notas.data.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">{T.vacio}</Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.fecha}</TableHead>
                <TableHead>{T.columnas.nota}</TableHead>
                <TableHead>{T.columnas.documento}</TableHead>
                <TableHead>{T.columnas.tercero}</TableHead>
                <TableHead>{T.columnas.motivo}</TableHead>
                <TableHead className="text-right">{T.columnas.total}</TableHead>
                <TableHead>{T.columnas.partida}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.data.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="tabular-nums whitespace-nowrap">{formatearFecha(n.fecha)}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {T.tipos[n.tipo]} {n.numeroNota}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {n.documento.numeroDocumento}
                  </TableCell>
                  <TableCell>{n.tercero?.nombre ?? T.consumidorFinal}</TableCell>
                  <TableCell>{T.motivos[n.motivo]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {n.tipo === "credito"
                      ? `(${formatearDinero(n.total, { simbolo: false })})`
                      : formatearDinero(n.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={n.estadoPartida === "borrador" ? "neutra" : "solida"}>
                      {T.estadoPartida[n.estadoPartida]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}
