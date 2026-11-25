import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Calculator, Printer } from "lucide-react";
import {
  areasSinCuentaAutomatica,
  type CalcularPlanilla,
  type ResultadoCalculoPlanillaVista,
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
import { formatearDinero } from "@/lib/formato";
import { imprimirDocumento } from "@/modules/reportes/imprimir-documento";
import { usePermiso } from "@/modules/organizacion/permisos";
import { sucursalesQuery } from "@/modules/organizacion/sucursales/sucursales-api";
import { cuentasQuery } from "@/modules/contabilidad/partidas/partidas-api";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import { empleadosQuery } from "../empleados/empleados-api";
import { useCalcularPlanilla } from "./planillas-api";
import { htmlBoletasPlanilla } from "./boletas-pdf";
import { TEXTOS_CALCULO_PLANILLA as T } from "./textos";

type AjusteCapturado = { horasExtra: string; diasAusencia: string; otrosDescuentos: string };

function esCuentaGastoImputable(cuenta: CuentaCatalogo, cuentas: readonly CuentaCatalogo[]): boolean {
  return (
    cuenta.activa &&
    cuenta.tipo === "costos_gastos" &&
    cuenta.codigo.startsWith("42") &&
    !cuentas.some((hija) => hija.cuentaPadreId === cuenta.id)
  );
}

function crearSolicitud(
  periodo: string,
  sucursalId: string,
  cuentasGastoPorArea: CalcularPlanilla["cuentasGastoPorArea"],
  ajustes: Record<string, AjusteCapturado>,
): CalcularPlanilla {
  return {
    periodo,
    sucursalId,
    cuentasGastoPorArea,
    ajustes: Object.entries(ajustes)
      .filter(([, ajuste]) =>
        [ajuste.horasExtra, ajuste.diasAusencia, ajuste.otrosDescuentos].some(
          (valor) => valor !== "" && valor !== "0" && valor !== "0.00",
        ),
      )
      .map(([empleadoId, ajuste]) => ({ empleadoId, ...ajuste })),
  };
}

function Resumen({ resultado, sucursal }: { resultado: ResultadoCalculoPlanillaVista; sucursal: string }) {
  const filas = [
    [T.bruto, resultado.resumen.bruto],
    [T.isssLaboral, resultado.resumen.isssLaboral],
    [T.afpLaboral, resultado.resumen.afpLaboral],
    [T.renta, resultado.resumen.renta],
    [T.otros, resultado.resumen.otrosDescuentos],
    [T.neto, resultado.resumen.neto],
    [T.isssPatronal, resultado.resumen.isssPatronal],
    [T.afpPatronal, resultado.resumen.afpPatronal],
    [T.gastoPatronal, resultado.resumen.gastoPatronal],
  ] as const;

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5">
        <div className="flex items-center gap-2">
          <BadgeCheck aria-hidden="true" className="size-5 text-primary" />
          <h2 className="font-semibold">{T.resumen}</h2>
        </div>
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
      <Card className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{T.detalle}</h2>
          <Button
            type="button"
            variant="outline"
            disabled={resultado.empleados.length === 0}
            onClick={() => imprimirDocumento(htmlBoletasPlanilla(resultado, sucursal))}
          >
            <Printer aria-hidden="true" />
            {T.boletasLote}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.empleado}</TableHead>
                <TableHead className="text-right">{T.columnas.salario}</TableHead>
                <TableHead className="text-right">{T.columnas.horasExtra}</TableHead>
                <TableHead className="text-right">{T.columnas.pagoExtra}</TableHead>
                <TableHead className="text-right">{T.columnas.diasAusencia}</TableHead>
                <TableHead className="text-right">{T.columnas.descuentoAusencia}</TableHead>
                <TableHead className="text-right">{T.columnas.otrosDescuentos}</TableHead>
                <TableHead className="text-right">{T.columnas.bruto}</TableHead>
                <TableHead className="text-right">{T.isssLaboral}</TableHead>
                <TableHead className="text-right">{T.afpLaboral}</TableHead>
                <TableHead className="text-right">{T.renta}</TableHead>
                <TableHead className="text-right">{T.isssPatronal}</TableHead>
                <TableHead className="text-right">{T.afpPatronal}</TableHead>
                <TableHead className="text-right">{T.neto}</TableHead>
                <TableHead>{T.boleta}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.empleados.map((empleado) => (
                <TableRow key={empleado.empleadoId}>
                  <TableCell>
                    <span className="font-medium">{empleado.puesto}</span>
                    <span className="block text-xs text-muted-foreground">{empleado.dui}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearDinero(empleado.salarioBase)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{empleado.horasExtra}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearDinero(empleado.pagoHorasExtra)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{empleado.diasAusencia}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearDinero(empleado.descuentoAusencia)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearDinero(empleado.otrosDescuentos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatearDinero(empleado.bruto)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearDinero(empleado.isssLaboral)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearDinero(empleado.afpLaboral)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatearDinero(empleado.renta)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearDinero(empleado.isssPatronal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearDinero(empleado.afpPatronal)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatearDinero(empleado.neto)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`${T.boletaIndividual} ${empleado.dui}`}
                      onClick={() =>
                        imprimirDocumento(htmlBoletasPlanilla(resultado, sucursal, empleado.empleadoId))
                      }
                    >
                      <Printer aria-hidden="true" />
                      {T.boletaIndividual}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

export function PantallaCalculoPlanilla({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeCalcular = usePermiso("planilla.calcular");
  const fecha = new Date();
  const periodoInicial = String(fecha.getFullYear()) + "-" + String(fecha.getMonth() + 1).padStart(2, "0");
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [sucursalId, setSucursalId] = useState("");
  const [pestana, setPestana] = useState<"calculo" | "distribucion">("calculo");
  const [cuentasGastoSeleccionadas, setCuentasGastoSeleccionadas] = useState<Record<string, string>>({});
  const [ajustes, setAjustes] = useState<Record<string, AjusteCapturado>>({});
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeCalcular });
  const empleados = useQuery({
    ...empleadosQuery(empresaId, { estado: "activos" }),
    enabled: puedeCalcular,
  });
  const cuentas = useQuery({ ...cuentasQuery(empresaId), enabled: puedeCalcular });
  const calculo = useCalcularPlanilla(empresaId);

  const sucursalesActivas = useMemo(
    () => (sucursales.data ?? []).filter((sucursal) => sucursal.activa),
    [sucursales.data],
  );
  const empleadosSucursal = useMemo(
    () => (empleados.data ?? []).filter((empleado) => empleado.sucursalId === sucursalId),
    [empleados.data, sucursalId],
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

  function cambiarAjuste(empleadoId: string, campo: keyof AjusteCapturado, valor: string) {
    calculo.reset();
    setAjustes((actuales) => ({
      ...actuales,
      [empleadoId]: {
        horasExtra: "0.00",
        diasAusencia: "0.00",
        otrosDescuentos: "0.00",
        ...actuales[empleadoId],
        [campo]: valor,
      },
    }));
  }

  function calcular(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuentasGastoPorArea = areasManuales.flatMap((area) => {
      const cuentaGastoId = cuentasGastoSeleccionadas[area.clave];
      return cuentaGastoId ? [{ clave: area.clave, cuentaGastoId }] : [];
    });
    calculo.mutate(crearSolicitud(periodo, sucursalId, cuentasGastoPorArea, ajustes));
  }

  const errorCarga = sucursales.isError || empleados.isError || cuentas.isError;
  const cargando = sucursales.isPending || empleados.isPending || cuentas.isPending;

  return (
    <Pagina className="max-w-[1440px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      {!puedeCalcular && <Alert variant="error">{T.sinPermiso}</Alert>}
      {puedeCalcular && errorCarga && (
        <Alert variant="error">
          <p>{T.errorDatos}</p>
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
      {puedeCalcular && cargando && (
        <p role="status" className="text-muted-foreground">
          Cargando datos de planilla…
        </p>
      )}
      {puedeCalcular && !cargando && !errorCarga && (
        <form className="grid gap-5" onSubmit={calcular}>
          <Card className="grid gap-4 p-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              {T.periodo}
              <Input
                type="month"
                required
                value={periodo}
                onChange={(evento) => {
                  setPeriodo(evento.target.value);
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
                  setAjustes({});
                  setCuentasGastoSeleccionadas({});
                  setPestana("calculo");
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
          <div role="tablist" aria-label={T.titulo} className="flex gap-2 border-b">
            {(["calculo", "distribucion"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={pestana === tab}
                className={`border-b-2 px-4 py-2 font-medium ${pestana === tab ? "border-primary" : "border-transparent text-muted-foreground"}`}
                onClick={() => setPestana(tab)}
              >
                {T.pestanas[tab]}
              </button>
            ))}
          </div>

          {pestana === "calculo" ? (
            <Card className="grid gap-3 p-4">
              <h2 className="font-semibold">{T.empleados}</h2>
              <p className="text-sm text-muted-foreground">{T.reglaAjustes}</p>
              {sucursalId && empleadosSucursal.length === 0 && (
                <p className="text-sm text-muted-foreground">{T.sinEmpleados}</p>
              )}
              {empleadosSucursal.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{T.columnas.empleado}</TableHead>
                        <TableHead className="text-right">{T.columnas.salario}</TableHead>
                        <TableHead>{T.columnas.horasExtra}</TableHead>
                        <TableHead>{T.columnas.diasAusencia}</TableHead>
                        <TableHead>{T.columnas.otrosDescuentos}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {empleadosSucursal.map((empleado) => {
                        const ajuste = ajustes[empleado.id] ?? {
                          horasExtra: "0.00",
                          diasAusencia: "0.00",
                          otrosDescuentos: "0.00",
                        };
                        return (
                          <TableRow key={empleado.id}>
                            <TableCell>
                              <span className="font-medium">{empleado.puesto}</span>
                              <span className="block text-xs text-muted-foreground">{empleado.dui}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatearDinero(empleado.salario)}
                            </TableCell>
                            <TableCell>
                              <Input
                                aria-label={T.horasExtra(empleado.dui)}
                                type="number"
                                min="0"
                                max="300"
                                step="0.01"
                                value={ajuste.horasExtra}
                                onChange={(evento) =>
                                  cambiarAjuste(empleado.id, "horasExtra", evento.target.value)
                                }
                                className="w-28"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                aria-label={T.diasAusencia(empleado.dui)}
                                type="number"
                                min="0"
                                max="30"
                                step="0.01"
                                value={ajuste.diasAusencia}
                                onChange={(evento) =>
                                  cambiarAjuste(empleado.id, "diasAusencia", evento.target.value)
                                }
                                className="w-28"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                aria-label={T.otrosDescuentos(empleado.dui)}
                                type="number"
                                min="0"
                                step="0.01"
                                value={ajuste.otrosDescuentos}
                                onChange={(evento) =>
                                  cambiarAjuste(empleado.id, "otrosDescuentos", evento.target.value)
                                }
                                className="w-32"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          ) : (
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
          )}

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
          {faltaCuentaManual && <Alert>{T.distribucion.pendiente}</Alert>}
        </form>
      )}
      {calculo.data && (
        <Resumen
          resultado={calculo.data}
          sucursal={
            sucursalesActivas.find((sucursal) => sucursal.id === calculo.data?.sucursalId)?.nombre ?? ""
          }
        />
      )}
    </Pagina>
  );
}
