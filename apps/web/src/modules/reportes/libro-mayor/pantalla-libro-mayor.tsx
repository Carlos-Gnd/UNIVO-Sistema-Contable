import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, LoaderCircle } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import type { LibroMayor } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Enlace } from "@/components/enlace";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { descargarArchivo } from "@/lib/descargas";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { cuentasQuery, sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { EncabezadoReporte } from "../comun/encabezado-reporte";
import { FiltrosDeReporte } from "../comun/filtros-reporte";
import { errorDeFiltros, mesDe, type FiltrosReporte } from "../comun/periodo";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import {
  crearExcelLibroMayor,
  htmlLibroMayor,
  imprimirHtml,
  nombreArchivoExcel,
  tieneSubcuentas,
  type EncabezadoExportacion,
} from "./exportar";
import { libroMayorQuery } from "./libro-mayor-api";
import { TEXTOS_LIBRO_MAYOR as T } from "./textos";

const monto = (valor: string) => formatearDinero(valor, { simbolo: false });
const ESPACIO_DURO = String.fromCharCode(0xa0);

/**
 * Libro mayor columnar (S2-T22, HU-27): los movimientos de una cuenta con su saldo acumulado, por período y
 * sucursal; si la cuenta es de mayor, incluye los de sus subcuentas. Se exporta a Excel y a PDF (S2-T23).
 */
export function PantallaLibroMayor({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("reportes.ver");
  const puedeExportar = usePermiso("reportes.exportar");
  const [cuentaId, setCuentaId] = useState("");
  const [filtros, setFiltros] = useState<FiltrosReporte>(() => ({ ...mesDe(), sucursalId: "" }));

  const cuentas = useQuery({ ...cuentasQuery(empresaId), enabled: puedeVer });
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const empresa = useQuery({ ...empresaQuery(empresaId), enabled: puedeVer });
  const errorFiltros = errorDeFiltros(filtros);
  const libro = useQuery({
    ...libroMayorQuery(empresaId, cuentaId, filtros),
    enabled: puedeVer && Boolean(cuentaId) && !errorFiltros,
  });

  const ordenadas = useMemo(
    () => [...(cuentas.data ?? [])].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [cuentas.data],
  );
  const sucursal = sucursales.data?.find((s) => s.id === filtros.sucursalId);
  const alcance = sucursal?.nombre ?? R.consolidado;
  const periodo = `${formatearFecha(filtros.desde)} al ${formatearFecha(filtros.hasta)}`;
  const d = libro.data;
  const encabezado: EncabezadoExportacion = {
    empresa: empresa.data?.nombreComercial ?? empresa.data?.nombre ?? "",
    periodo,
    alcance,
  };

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeExportar && d && !libro.isError && <BotonesExportar libro={d} encabezado={encabezado} />}
      </EncabezadoPagina>

      {!puedeVer ? (
        <Alert>{R.sinPermiso}</Alert>
      ) : (
        <>
          <Card className="p-4">
            <Field className="w-full sm:max-w-[520px]">
              <FieldLabel htmlFor="mayor-cuenta">{T.cuenta}</FieldLabel>
              <NativeSelect
                id="mayor-cuenta"
                className="h-10"
                value={cuentaId}
                disabled={!cuentas.isSuccess}
                onChange={(e) => setCuentaId(e.target.value)}
              >
                <option value="">{T.elegirCuenta}</option>
                {ordenadas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {/* Sangría con espacios duros: el navegador ignora los normales dentro de una opción */}
                    {`${ESPACIO_DURO.repeat(Math.max(0, c.nivel - 1) * 2)}${c.codigo} — ${c.nombre}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </Card>
          <FiltrosDeReporte
            valor={filtros}
            onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
            sucursales={sucursales.data ?? []}
          />

          {cuentas.isError && <Alert variant="error">{mensajeDeError(cuentas.error)}</Alert>}
          {!cuentaId && cuentas.isSuccess && (
            <p className="p-10 text-center text-muted-foreground">{T.sinCuenta}</p>
          )}

          {cuentaId && libro.isFetching && !d && (
            <p role="status" className="text-muted-foreground">
              {R.cargando}
            </p>
          )}
          {cuentaId && libro.isError && (
            <Alert variant="error">
              <p>
                {R.error} {mensajeDeError(libro.error)}
              </p>
              {!(libro.error instanceof ErrorApi && libro.error.estado === 403) && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void libro.refetch()}>
                  {R.reintentar}
                </Button>
              )}
            </Alert>
          )}

          {cuentaId && d && !libro.isError && (
            <Card className={cn("overflow-hidden", libro.isFetching && "opacity-60")}>
              <EncabezadoReporte
                empresaId={empresaId}
                titulo={`${T.titulo} · ${d.codigo} ${d.nombre}`}
                periodo={periodo}
                alcance={`${alcance} · ${T.naturaleza[d.naturaleza]}`}
              />
              <TablaMayor empresaId={empresaId} libro={d} />
            </Card>
          )}
          <p className="text-xs text-muted-foreground">{R.nota}</p>
        </>
      )}
    </Pagina>
  );
}

function TablaMayor({ empresaId, libro }: { empresaId: string; libro: LibroMayor }) {
  const conSubcuentas = tieneSubcuentas(libro);
  const vacias = conSubcuentas ? 5 : 4;
  return (
    <Table className="min-w-[860px]" aria-label={`${T.titulo} ${libro.codigo}`}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[110px]">{T.columnas.fecha}</TableHead>
          <TableHead className="w-[90px]">{T.columnas.partida}</TableHead>
          <TableHead>{T.columnas.concepto}</TableHead>
          {conSubcuentas && <TableHead>{T.columnas.subcuenta}</TableHead>}
          <TableHead>{T.columnas.sucursal}</TableHead>
          <TableHead className="w-[130px] text-right">{T.columnas.debe}</TableHead>
          <TableHead className="w-[130px] text-right">{T.columnas.haber}</TableHead>
          <TableHead className="w-[140px] text-right">{T.columnas.saldo}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="text-muted-foreground italic hover:bg-transparent">
          <TableCell colSpan={vacias + 2}>{T.saldoInicial}</TableCell>
          <TableCell className="text-right tabular-nums">{monto(libro.saldoInicial)}</TableCell>
        </TableRow>
        {libro.movimientos.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={vacias + 3} className="py-8 text-center text-muted-foreground">
              {T.vacio}
            </TableCell>
          </TableRow>
        )}
        {libro.movimientos.map((m, i) => (
          <TableRow key={`${m.partidaId}-${m.cuentaCodigo}-${i}`}>
            <TableCell className="whitespace-nowrap tabular-nums">{formatearFecha(m.fecha)}</TableCell>
            <TableCell>
              <Enlace
                href={`/empresas/${encodeURIComponent(empresaId)}/partidas/${encodeURIComponent(m.partidaId)}`}
                className="text-foreground tabular-nums underline-offset-4 hover:underline"
              >
                {T.numero(m.numero)}
              </Enlace>
            </TableCell>
            <TableCell className="max-w-[320px] truncate">{m.concepto ?? T.sinConcepto}</TableCell>
            {conSubcuentas && (
              <TableCell className="text-muted-foreground">
                <span className="tabular-nums">{m.cuentaCodigo}</span> {m.cuentaNombre}
              </TableCell>
            )}
            <TableCell className="text-muted-foreground">{m.sucursal}</TableCell>
            <TableCell className="text-right tabular-nums">{monto(m.debe)}</TableCell>
            <TableCell className="text-right tabular-nums">{monto(m.haber)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{monto(m.saldo)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-secondary/60 font-semibold hover:bg-secondary/60">
          <TableCell colSpan={vacias}>{T.totales}</TableCell>
          <TableCell className="text-right tabular-nums">{monto(libro.totalDebe)}</TableCell>
          <TableCell className="text-right tabular-nums">{monto(libro.totalHaber)}</TableCell>
          <TableCell className="text-right tabular-nums">{monto(libro.saldoFinal)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function BotonesExportar({ libro, encabezado }: { libro: LibroMayor; encabezado: EncabezadoExportacion }) {
  const [generando, setGenerando] = useState(false);

  async function exportarExcel() {
    setGenerando(true);
    try {
      descargarArchivo(await crearExcelLibroMayor(libro, encabezado), nombreArchivoExcel(libro));
    } catch {
      toast.error(T.exportar.error);
    } finally {
      setGenerando(false);
    }
  }

  function exportarPdf() {
    if (!imprimirHtml(htmlLibroMayor(libro, encabezado))) toast.error(T.exportar.ventanaBloqueada);
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-11 rounded-full px-5"
        disabled={generando}
        onClick={() => void exportarExcel()}
      >
        {generando ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <FileSpreadsheet aria-hidden="true" />
        )}
        {generando ? T.exportar.generando : T.exportar.excel}
      </Button>
      <Button variant="outline" className="h-11 rounded-full px-5" onClick={exportarPdf}>
        <FileDown aria-hidden="true" />
        {T.exportar.pdf}
      </Button>
    </>
  );
}
