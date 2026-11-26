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
import { formatearDinero, formatearFecha } from "@/lib/formato";
import type { LibroTabular } from "./libro-tabular";
import { TEXTOS_LIBROS_IVA as T } from "./textos";

/** Tabla de un libro de IVA con sus totales; el documento anulado se muestra tachado y sin montos. */
export function TablaLibro({ libro }: { libro: LibroTabular }) {
  const { columnas, filas } = libro;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columnas.map((c) => (
            <TableHead key={c.clave} className={cn(c.tipo === "monto" && "text-right")}>
              {c.titulo}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columnas.length} className="py-8 text-center text-muted-foreground">
              {T.vacio}
            </TableCell>
          </TableRow>
        ) : (
          filas.map((f) => (
            <TableRow key={f.id} className={cn(f.anulado && "text-muted-foreground line-through")}>
              {columnas.map((c) => (
                <TableCell
                  key={c.clave}
                  className={cn(
                    c.tipo === "monto" && "text-right tabular-nums",
                    c.clave === "fecha" && "whitespace-nowrap",
                  )}
                >
                  {c.tipo === "monto"
                    ? formatearDinero(String(f[c.clave] ?? "0.00"), { simbolo: false })
                    : c.clave === "fecha"
                      ? formatearFecha(String(f[c.clave]))
                      : String(f[c.clave] ?? "")}
                  {c.clave === "documento" && f.anulado && (
                    <span className="ml-2 no-underline">({T.anulado})</span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
      {filas.length > 0 && (
        <TableFooter>
          <TableRow className="font-bold">
            {columnas.map((c, i) => (
              <TableCell key={c.clave} className={cn(c.tipo === "monto" && "text-right tabular-nums")}>
                {i === 0
                  ? T.totales
                  : c.tipo === "monto"
                    ? formatearDinero(libro.totales[c.clave] ?? "0.00", { simbolo: false })
                    : ""}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
