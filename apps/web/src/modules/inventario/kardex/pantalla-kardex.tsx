import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, LoaderCircle, Plus } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import type { KardexVista, LineaKardex } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { descargarArchivo } from "@/lib/descargas";
import { formatearFecha } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { imprimirDocumento } from "@/modules/reportes/imprimir-documento";
import { productosQuery } from "../productos/productos-api";
import { DialogoMovimiento } from "./dialogo-movimiento";
import { crearExcelKardex, htmlKardex, nombreArchivoExcel, type EncabezadoKardex } from "./exportar";
import { costoUnitario, monto, unidades } from "./formato";
import { kardexQuery, type FiltrosKardex } from "./kardex-api";
import { TEXTOS_KARDEX as T } from "./textos";

const TODOS = { busqueda: "", categoriaId: "", estado: "todos" } as const;

/** Kardex de un producto por sucursal (HU-65, S3-T80): entradas, salidas y saldo en unidades y valores. */
export function PantallaKardex({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("inventario.ver");
  const puedeRegistrar = usePermiso("inventario.registrar");
  const [productoId, setProductoId] = useState("");
  const [sucursalElegida, setSucursalElegida] = useState("");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [registrando, setRegistrando] = useState(false);

  const productos = useQuery({ ...productosQuery(empresaId, TODOS), enabled: puedeVer });
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const empresa = useQuery({ ...empresaQuery(empresaId), enabled: puedeVer });
  const activas = useMemo(() => (sucursales.data ?? []).filter((s) => s.activa), [sucursales.data]);
  const sucursalId = sucursalElegida || activas.find((s) => s.esMatriz)?.id || activas[0]?.id || "";
  const filtros: FiltrosKardex = { sucursalId, ...rango };
  const rangoInvalido = Boolean(rango.desde && rango.hasta && rango.desde > rango.hasta);
  const kardex = useQuery({
    ...kardexQuery(empresaId, productoId, filtros),
    enabled: puedeVer && Boolean(productoId) && Boolean(sucursalId) && !rangoInvalido,
  });

  const d = kardex.data;
  const sucursal = activas.find((s) => s.id === sucursalId);
  const encabezado: EncabezadoKardex = {
    empresa: empresa.data?.nombreComercial ?? empresa.data?.nombre ?? "",
    sucursal: sucursal?.nombre ?? "",
  };

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeVer && d && !kardex.isError && <BotonesExportar kardex={d} encabezado={encabezado} />}
        {puedeRegistrar && productoId && sucursalId && (
          <Button className="h-11 rounded-full px-5" onClick={() => setRegistrando(true)}>
            <Plus aria-hidden="true" />
            {T.registrar}
          </Button>
        )}
      </EncabezadoPagina>

      {!puedeVer ? (
        <Alert>{T.sinPermiso}</Alert>
      ) : (
        <>
          <Card className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <Field>
              <FieldLabel htmlFor="kardex-producto">{T.producto}</FieldLabel>
              <NativeSelect
                id="kardex-producto"
                className="h-10"
                value={productoId}
                disabled={!productos.isSuccess}
                onChange={(e) => setProductoId(e.target.value)}
              >
                <option value="">{T.elegirProducto}</option>
                {(productos.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.codigo} · ${p.nombre}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="kardex-sucursal">{T.sucursal}</FieldLabel>
              <NativeSelect
                id="kardex-sucursal"
                className="h-10"
                value={sucursalId}
                onChange={(e) => setSucursalElegida(e.target.value)}
              >
                {activas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="kardex-desde">{T.desde}</FieldLabel>
              <Input
                id="kardex-desde"
                type="date"
                className="h-10"
                value={rango.desde}
                onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="kardex-hasta">{T.hasta}</FieldLabel>
              <Input
                id="kardex-hasta"
                type="date"
                className="h-10"
                value={rango.hasta}
                onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
              />
            </Field>
          </Card>

          {rangoInvalido && <Alert variant="error">{T.rangoInvalido}</Alert>}
          {sucursales.isSuccess && activas.length === 0 && <Alert>{T.sinSucursales}</Alert>}
          {!productoId && productos.isSuccess && (
            <p className="p-10 text-center text-muted-foreground">{T.sinProducto}</p>
          )}
          {productoId && kardex.isFetching && !d && (
            <p role="status" className="text-muted-foreground">
              {T.cargando}
            </p>
          )}
          {productoId && kardex.isError && (
            <Alert variant="error">
              <p>
                {T.error} {mensajeDeError(kardex.error)}
              </p>
              {!(kardex.error instanceof ErrorApi && kardex.error.estado === 403) && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void kardex.refetch()}>
                  {T.reintentar}
                </Button>
              )}
            </Alert>
          )}

          {productoId && d && !kardex.isError && (
            <Card className={cn("overflow-hidden", kardex.isFetching && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
                <h2 className="font-semibold">{`${d.codigo} · ${d.nombre}`}</h2>
                <Badge variant="neutra">{T.metodo[d.metodo]}</Badge>
                <span className="text-sm text-muted-foreground">{d.unidadMedida}</span>
              </div>
              <TablaKardex kardex={d} />
            </Card>
          )}
          <p className="text-xs text-muted-foreground">{T.nota}</p>
        </>
      )}

      {puedeRegistrar && productoId && sucursalId && (
        <DialogoMovimiento
          empresaId={empresaId}
          productoId={productoId}
          sucursalId={sucursalId}
          abierto={registrando}
          onCerrar={() => setRegistrando(false)}
        />
      )}
    </Pagina>
  );
}

const Numero = ({ children }: { children: React.ReactNode }) => (
  <TableCell className="text-right whitespace-nowrap tabular-nums">{children}</TableCell>
);

function Trio({ cantidad, unitario, total }: { cantidad: string; unitario: string; total: string }) {
  return (
    <>
      <Numero>{unidades(cantidad)}</Numero>
      <Numero>{costoUnitario(unitario)}</Numero>
      <Numero>{monto(total)}</Numero>
    </>
  );
}

const Vacios = () => (
  <>
    <TableCell />
    <TableCell />
    <TableCell />
  </>
);

function FilaKardex({ linea }: { linea: LineaKardex }) {
  const d = linea.entrada ?? linea.salida!;
  const detalle = <Trio cantidad={d.cantidad} unitario={d.costoUnitario} total={d.costoTotal} />;
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums">{formatearFecha(linea.fecha)}</TableCell>
      <TableCell className="max-w-[160px] truncate text-muted-foreground">{linea.referencia ?? ""}</TableCell>
      {linea.entrada ? detalle : <Vacios />}
      {linea.salida ? detalle : <Vacios />}
      <Trio
        cantidad={linea.saldo.cantidad}
        unitario={linea.saldo.costoUnitario}
        total={linea.saldo.costoTotal}
      />
    </TableRow>
  );
}

function TablaKardex({ kardex: k }: { kardex: KardexVista }) {
  const ini = k.saldoInicial;
  const fin = k.saldoFinal;
  const t = k.totales;
  const grupo = "border-l border-border text-center";
  return (
    <Table className="min-w-[980px]" aria-label={`${T.titulo} ${k.codigo}`}>
      <TableHeader>
        <TableRow>
          <TableHead rowSpan={2}>{T.columnas.fecha}</TableHead>
          <TableHead rowSpan={2}>{T.columnas.referencia}</TableHead>
          <TableHead colSpan={3} className={grupo}>
            {T.columnas.entradas}
          </TableHead>
          <TableHead colSpan={3} className={grupo}>
            {T.columnas.salidas}
          </TableHead>
          <TableHead colSpan={3} className={grupo}>
            {T.columnas.saldo}
          </TableHead>
        </TableRow>
        <TableRow>
          {[0, 1, 2].map((i) => (
            <FragmentoEncabezado key={i} />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="text-muted-foreground italic hover:bg-transparent">
          <TableCell colSpan={8}>{T.saldoInicial}</TableCell>
          <Trio cantidad={ini.cantidad} unitario={ini.costoUnitario} total={ini.costoTotal} />
        </TableRow>
        {k.lineas.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
              {T.vacio}
            </TableCell>
          </TableRow>
        )}
        {k.lineas.map((l) => (
          <FilaKardex key={l.id} linea={l} />
        ))}
        <TableRow className="bg-secondary/60 font-semibold hover:bg-secondary/60">
          <TableCell colSpan={2}>{T.totales}</TableCell>
          <Numero>{unidades(t.entradaCantidad)}</Numero>
          <TableCell />
          <Numero>{monto(t.entradaTotal)}</Numero>
          <Numero>{unidades(t.salidaCantidad)}</Numero>
          <TableCell />
          <Numero>{monto(t.salidaTotal)}</Numero>
          <Trio cantidad={fin.cantidad} unitario={fin.costoUnitario} total={fin.costoTotal} />
        </TableRow>
      </TableBody>
    </Table>
  );
}

function FragmentoEncabezado() {
  return (
    <>
      <TableHead className="border-l border-border text-right">{T.columnas.cantidad}</TableHead>
      <TableHead className="text-right">{T.columnas.costoUnitario}</TableHead>
      <TableHead className="text-right">{T.columnas.total}</TableHead>
    </>
  );
}

function BotonesExportar({ kardex, encabezado }: { kardex: KardexVista; encabezado: EncabezadoKardex }) {
  const [generando, setGenerando] = useState(false);

  async function exportarExcel() {
    setGenerando(true);
    try {
      descargarArchivo(await crearExcelKardex(kardex, encabezado), nombreArchivoExcel(kardex));
    } catch {
      toast.error(T.exportar.error);
    } finally {
      setGenerando(false);
    }
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
      <Button
        variant="outline"
        className="h-11 rounded-full px-5"
        onClick={() =>
          !imprimirDocumento(htmlKardex(kardex, encabezado)) && toast.error(T.exportar.ventanaBloqueada)
        }
      >
        <FileDown aria-hidden="true" />
        {T.exportar.pdf}
      </Button>
    </>
  );
}
