import { Dinero, type HojaTrabajo, type LineaHojaTrabajo, type TotalesHojaTrabajo } from "@contable/shared";
import { cn } from "cn";
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
import { Cifra } from "../balanzas/tabla-balanza";
import { TEXTOS_HOJA_TRABAJO as T } from "./textos-pantalla";

const C = T.columnas;

const COLUMNAS: readonly { clave: keyof TotalesHojaTrabajo; lado: string }[] = [
  { clave: "balanzaDebe", lado: C.debe },
  { clave: "balanzaHaber", lado: C.haber },
  { clave: "ajustesDebe", lado: C.debe },
  { clave: "ajustesHaber", lado: C.haber },
  { clave: "balanzaAjustadaDebe", lado: C.debe },
  { clave: "balanzaAjustadaHaber", lado: C.haber },
  { clave: "estadoResultadosDebe", lado: C.debe },
  { clave: "estadoResultadosHaber", lado: C.haber },
  { clave: "balanceGeneralDebe", lado: C.debe },
  { clave: "balanceGeneralHaber", lado: C.haber },
];

const GRUPOS = [C.balanza, C.ajustes, C.balanzaAjustada, C.estadoResultados, C.balanceGeneral] as const;

const celda = "text-right tabular-nums whitespace-nowrap";

/** Suma de las cuentas (sin la línea de resultado), con aritmética decimal exacta. */
function sumar(lineas: readonly LineaHojaTrabajo[]): TotalesHojaTrabajo {
  return Object.fromEntries(
    COLUMNAS.map(({ clave }) => [clave, Dinero.sumar(lineas.map((l) => l[clave])).aTexto()]),
  ) as unknown as TotalesHojaTrabajo;
}

function FilaTotales({
  etiqueta,
  totales,
  fuerte = false,
}: {
  etiqueta: string;
  totales: TotalesHojaTrabajo;
  fuerte?: boolean;
}) {
  return (
    <TableRow className={cn(fuerte && "font-bold")}>
      <TableCell className="sticky left-0 z-[1] bg-card">{etiqueta}</TableCell>
      {COLUMNAS.map((c) => (
        <TableCell key={c.clave} className={celda}>
          {formatearDinero(totales[c.clave], { simbolo: false })}
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * Hoja de trabajo en el formato de clase: las cuentas, «Sumas», la utilidad o pérdida del ejercicio y
 * «Sumas iguales». La columna de la cuenta queda fija al desplazarse hacia los lados.
 */
export function TablaHojaTrabajo({ hoja }: { hoja: HojaTrabajo }) {
  const cuentas = hoja.lineas.filter((l) => l.resultado === null);
  const resultados = hoja.lineas.filter((l) => l.resultado !== null);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead rowSpan={2} className="sticky left-0 z-[1] min-w-[260px] bg-card">
            {C.cuenta}
          </TableHead>
          {GRUPOS.map((g) => (
            <TableHead key={g} colSpan={2} className="text-center">
              {g}
            </TableHead>
          ))}
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
        {cuentas.map((l) => (
          <TableRow key={l.cuentaId}>
            <TableCell className="sticky left-0 z-[1] bg-card">
              <span className="flex flex-wrap items-center gap-x-2 whitespace-nowrap">
                <span className="text-muted-foreground tabular-nums">{l.codigo}</span>
                {l.nombre}
              </span>
            </TableCell>
            {COLUMNAS.map((c) => (
              <TableCell key={c.clave} className={celda}>
                <Cifra monto={l[c.clave]} />
              </TableCell>
            ))}
          </TableRow>
        ))}
        {cuentas.length === 0 && (
          <TableRow>
            <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
              {T.vacio}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      <TableFooter>
        <FilaTotales etiqueta={T.sumas} totales={sumar(cuentas)} />
        {resultados.map((l) => (
          <TableRow key={l.resultado} className="italic">
            <TableCell className="sticky left-0 z-[1] bg-card">{l.nombre}</TableCell>
            {COLUMNAS.map((c) => (
              <TableCell key={c.clave} className={celda}>
                <Cifra monto={l[c.clave]} />
              </TableCell>
            ))}
          </TableRow>
        ))}
        <FilaTotales etiqueta={T.sumasIguales} totales={hoja.totales} fuerte />
      </TableFooter>
    </Table>
  );
}
