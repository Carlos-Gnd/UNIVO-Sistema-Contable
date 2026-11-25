import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import {
  areasSinCuentaAutomatica,
  type CalcularPrestaciones,
  type ResultadoCalculoPrestacionesVista,
} from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { DistribucionGasto } from "../distribucion-gasto";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { sucursalesQuery } from "@/modules/organizacion/sucursales/sucursales-api";
import { cuentasQuery } from "@/modules/contabilidad/partidas/partidas-api";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import { empleadosQuery } from "../empleados/empleados-api";
import { useCalcularPrestaciones } from "./prestaciones-api";
import { TEXTOS_PRESTACIONES as T } from "./textos";

function esCuentaGastoImputable(cuenta: CuentaCatalogo, cuentas: readonly CuentaCatalogo[]): boolean {
  return (
    cuenta.activa &&
    cuenta.tipo === "costos_gastos" &&
    cuenta.codigo.startsWith("42") &&
    !cuentas.some((hija) => hija.cuentaPadreId === cuenta.id)
  );
}

function ResumenPrestaciones({ resultado }: { resultado: ResultadoCalculoPrestacionesVista }) {
  const filas = [
    [T.conceptos.aguinaldo, resultado.resumen.montoAguinaldo],
    [T.conceptos.provisionAguinaldo, resultado.resumen.provisionAguinaldoMensual],
    [T.conceptos.vacaciones, resultado.resumen.montoVacaciones],
    [T.conceptos.provisionVacaciones, resultado.resumen.provisionVacacionesMensual],
    [T.conceptos.indemnizacion, resultado.resumen.montoIndemnizacion],
    [T.conceptos.provisionIndemnizacion, resultado.resumen.provisionIndemnizacionMensual],
    [T.conceptos.provisionTotal, resultado.resumen.provisionMensualTotal],
  ] as const;
  return (
    <Card className="grid gap-4 p-5">
      <h2 className="font-semibold">{T.resumen}</h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {filas.map(([etiqueta, monto]) => (
          <div key={etiqueta} className="flex items-center justify-between gap-3 border-b pb-2">
            <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
            <dd className="font-medium tabular-nums">{formatearDinero(monto)}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-lg bg-muted/50 p-4">
        <p className="font-medium">{T.partida}</p>
        <p className="mt-1 text-sm text-muted-foreground">{T.estadoBorrador}</p>
        <p className="mt-2 break-all font-mono text-xs">{resultado.partida.id}</p>
      </div>
    </Card>
  );
}

export function PantallaPrestaciones({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeCalcular = usePermiso("planilla.calcular");
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaCalculo, setFechaCalculo] = useState(hoy);
  const [sucursalId, setSucursalId] = useState("");
  const [cuentasGastoSeleccionadas, setCuentasGastoSeleccionadas] = useState<Record<string, string>>({});
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeCalcular });
  const empleados = useQuery({
    ...empleadosQuery(empresaId, { estado: "activos" }),
    enabled: puedeCalcular,
  });
  const cuentas = useQuery({ ...cuentasQuery(empresaId), enabled: puedeCalcular });
  const calculo = useCalcularPrestaciones(empresaId);

  const sucursalesActivas = useMemo(
    () => (sucursales.data ?? []).filter((sucursal) => sucursal.activa),
    [sucursales.data],
  );
  const empleadosSucursal = useMemo(
    () =>
      (empleados.data ?? []).filter(
        (empleado) => empleado.sucursalId === sucursalId && empleado.fechaIngreso <= fechaCalculo,
      ),
    [empleados.data, sucursalId, fechaCalculo],
  );
  const cuentasGasto = useMemo(() => {
    const lista = cuentas.data ?? [];
    return lista.filter((cuenta) => esCuentaGastoImputable(cuenta, lista));
  }, [cuentas.data]);
  const areasManuales = useMemo(
    () => areasSinCuentaAutomatica(empleadosSucursal.map((empleado) => empleado.area)),
    [empleadosSucursal],
  );
  const faltaCuentaManual = areasManuales.some((area) => !cuentasGastoSeleccionadas[area.clave]);

  function calcular(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuentasGastoPorArea = areasManuales.flatMap((area) => {
      const cuentaGastoId = cuentasGastoSeleccionadas[area.clave];
      return cuentaGastoId ? [{ clave: area.clave, cuentaGastoId }] : [];
    });
    const datos: CalcularPrestaciones = { fechaCalculo, sucursalId, cuentasGastoPorArea };
    calculo.mutate(datos);
  }

  const errorCarga = sucursales.isError || empleados.isError || cuentas.isError;
  const cargando = sucursales.isPending || empleados.isPending || cuentas.isPending;

  return (
    <Pagina className="max-w-[1440px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      {!puedeCalcular && <Alert variant="error">{T.sinPermiso}</Alert>}
      {puedeCalcular && errorCarga && (
        <Alert variant="error">
          <p>{T.errorCarga}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              void sucursales.refetch();
              void empleados.refetch();
              void cuentas.refetch();
            }}
          >
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {puedeCalcular && cargando && <p role="status">{T.cargando}</p>}
      {puedeCalcular && !cargando && !errorCarga && (
        <form className="grid gap-5" onSubmit={calcular}>
          <Card className="grid gap-4 p-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              {T.fechaCalculo}
              <Input
                type="date"
                required
                value={fechaCalculo}
                onChange={(evento) => {
                  setFechaCalculo(evento.target.value);
                  calculo.reset();
                }}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {T.sucursal}
              <NativeSelect
                required
                value={sucursalId}
                onChange={(evento) => {
                  setSucursalId(evento.target.value);
                  setCuentasGastoSeleccionadas({});
                  calculo.reset();
                }}
              >
                <option value="">{T.seleccionarSucursal}</option>
                {sucursalesActivas.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id}>
                    {sucursal.nombre}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </Card>
          <DistribucionGasto
            areas={areasManuales}
            cuentas={cuentasGasto}
            asignaciones={cuentasGastoSeleccionadas}
            textos={T.distribucion}
            onAsignar={(clave, cuentaId) => {
              setCuentasGastoSeleccionadas((actuales) => ({ ...actuales, [clave]: cuentaId }));
              calculo.reset();
            }}
          />
          {empleadosSucursal.length === 0 && <Alert>{sucursalId ? T.sinEmpleados : T.sinResultado}</Alert>}
          {faltaCuentaManual && <Alert>{T.distribucion.pendiente}</Alert>}
          {calculo.isError && (
            <Alert variant="error">
              {T.errorCalculo} {mensajeDeError(calculo.error)}
            </Alert>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                calculo.isPending || !sucursalId || faltaCuentaManual || empleadosSucursal.length === 0
              }
            >
              <Calculator aria-hidden="true" />
              {calculo.isPending ? T.calculando : T.calcular}
            </Button>
          </div>
        </form>
      )}
      {calculo.data && (
        <>
          <p className="text-sm text-muted-foreground">
            {T.periodo}: {calculo.data.periodo}
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.columnas.empleado}</TableHead>
                  <TableHead>{T.columnas.ingreso}</TableHead>
                  <TableHead className="text-right">{T.columnas.servicio}</TableHead>
                  <TableHead className="text-right">{T.columnas.aguinaldo}</TableHead>
                  <TableHead className="text-right">{T.columnas.provisionAguinaldo}</TableHead>
                  <TableHead className="text-right">{T.columnas.vacaciones}</TableHead>
                  <TableHead className="text-right">{T.columnas.provisionVacaciones}</TableHead>
                  <TableHead className="text-right">{T.columnas.baseIndemnizacion}</TableHead>
                  <TableHead className="text-right">{T.columnas.indemnizacion}</TableHead>
                  <TableHead className="text-right">{T.columnas.provisionIndemnizacion}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calculo.data.empleados.map((empleado) => (
                  <TableRow key={empleado.empleadoId}>
                    <TableCell>
                      <span className="font-medium">{empleado.puesto}</span>
                      <span className="block text-xs text-muted-foreground">{empleado.dui}</span>
                    </TableCell>
                    <TableCell>{formatearFecha(empleado.fechaIngreso)}</TableCell>
                    <TableCell className="text-right tabular-nums">{empleado.aniosServicio}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(empleado.montoAguinaldo)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(empleado.provisionAguinaldoMensual)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(empleado.montoVacaciones)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(empleado.provisionVacacionesMensual)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(empleado.salarioBaseIndemnizacion)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(empleado.montoIndemnizacion)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearDinero(empleado.provisionIndemnizacionMensual)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ResumenPrestaciones resultado={calculo.data} />
        </>
      )}
    </Pagina>
  );
}
