import { Dinero, type Balanza, type LineaBalanza } from "@contable/shared";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearDinero } from "@/lib/formato";
import { TEXTOS_BALANZAS as T } from "./textos";

const C = T.columnas;

/** Cifra con dos decimales; el cero se muestra atenuado como «—» para que se lean los saldos. */
export function Cifra({ monto }: { monto: string }) {
  if (Dinero.de(monto).esCero()) return <span className="text-muted-foreground">—</span>;
  return <>{formatearDinero(monto, { simbolo: false })}</>;
}

const COLUMNAS: readonly {
  clave: keyof Omit<
    LineaBalanza,
    "cuentaId" | "codigo" | "nombre" | "naturaleza" | "tipo" | "saldoContrario"
  >;
  lado: string;
}[] = [
  { clave: "saldoInicialDebe", lado: C.debe },
  { clave: "saldoInicialHaber", lado: C.haber },
  { clave: "movimientoDebe", lado: C.debe },
  { clave: "movimientoHaber", lado: C.haber },
  { clave: "saldoFinalDebe", lado: C.debe },
  { clave: "saldoFinalHaber", lado: C.haber },
];

/** Balanza con saldos iniciales, movimientos y saldos finales, y la fila de totales. */
export function TablaBalanza({ balanza }: { balanza: Balanza }) {
  const celda = "text-right tabular-nums whitespace-nowrap";
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead rowSpan={2} className="sticky left-0 z-[1] min-w-[260px] bg-card">
            {C.codigo} y {C.cuenta.toLowerCase()}
          </TableHead>
          <TableHead colSpan={2} className="text-center">
            {C.saldoInicial}
          </TableHead>
          <TableHead colSpan={2} className="text-center">
            {C.movimientos}
          </TableHead>
          <TableHead colSpan={2} className="text-center">
            {C.saldoFinal}
          </TableHead>
        </TableRow>
        <TableRow>
          {COLUMNAS.map((c) => (
            <TableHead key={c.clave} className="text-right">
              {c.lado}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {balanza.lineas.map((l) => (
          <TableRow key={l.cuentaId}>
            <TableCell className="sticky left-0 z-[1] bg-card">
              <span className="flex flex-wrap items-center gap-x-2 whitespace-nowrap">
                <span className="text-muted-foreground tabular-nums">{l.codigo}</span>
                {l.nombre}
                {l.saldoContrario && <Badge variant="alerta">{T.saldoContrario}</Badge>}
              </span>
            </TableCell>
            {COLUMNAS.map((c) => (
              <TableCell key={c.clave} className={cn(celda)}>
                <Cifra monto={l[c.clave]} />
              </TableCell>
            ))}
          </TableRow>
        ))}
        {balanza.lineas.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
              {T.vacio}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      <TableFooter>
        <TableRow className="font-bold">
          <TableCell className="sticky left-0 z-[1] bg-card">{C.totales}</TableCell>
          {COLUMNAS.map((c) => (
            <TableCell key={c.clave} className={celda}>
              {formatearDinero(balanza.totales[c.clave], { simbolo: false })}
            </TableCell>
          ))}
        </TableRow>
      </TableFooter>
    </Table>
  );
}
