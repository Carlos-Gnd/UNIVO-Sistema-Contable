import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { Dinero } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Campo } from "@/components/campo";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { cuentasQuery, sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { usePermiso, usePermisos } from "@/modules/organizacion/permisos";
import { cuentasTesoreriaQuery } from "../cuentas/cuentas-tesoreria-api";
import { cajasChicasQuery } from "./caja-chica-api";
import { FormularioAperturaCajaChica } from "./formulario-apertura";
import { FormularioValeCajaChica } from "./formulario-vale";
import { FormularioReintegroCajaChica } from "./formulario-reintegro";
import { PantallaMovimientosBancarios } from "./pantalla-movimientos-bancarios";
import { PantallaConciliacionBancaria } from "./pantalla-conciliacion-bancaria";
import { TEXTOS_CAJA_CHICA as T } from "./textos";

type Dialogo = "apertura" | "vale" | "reintegro" | null;
type Pestana = "caja-chica" | "cheques" | "conciliacion";

/** Caja chica usa la misma ruta que las pestañas de movimientos y conciliación del módulo Tesorería. */
export function PantallaCajaChica({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("tesoreria.ver");
  const puedeRegistrar = usePermiso("tesoreria.registrar");
  const { todasSucursales, sucursales: sucursalesAsignadas } = usePermisos();
  const [sucursalElegida, setSucursalElegida] = useState("");
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [pestana, setPestana] = useState<Pestana>("caja-chica");
  const cajas = useQuery({ ...cajasChicasQuery(empresaId), enabled: puedeVer });
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeRegistrar });
  const cuentasTesoreria = useQuery({
    ...cuentasTesoreriaQuery(empresaId),
    enabled: puedeVer && puedeRegistrar,
  });
  const catalogo = useQuery({ ...cuentasQuery(empresaId), enabled: puedeVer && puedeRegistrar });

  const sucursalesVisibles = useMemo(
    () =>
      (sucursales.data ?? []).filter(
        (sucursal) => sucursal.activa && (todasSucursales || sucursalesAsignadas.includes(sucursal.id)),
      ),
    [sucursales.data, sucursalesAsignadas, todasSucursales],
  );
  const sucursalesSelector = useMemo(
    () =>
      puedeRegistrar
        ? sucursalesVisibles
        : (cajas.data ?? []).map((caja) => ({ id: caja.sucursalId, nombre: caja.sucursal, activa: true })),
    [cajas.data, puedeRegistrar, sucursalesVisibles],
  );

  const sucursalId = sucursalElegida || cajas.data?.[0]?.sucursalId || sucursalesVisibles[0]?.id || "";

  const caja = (cajas.data ?? []).find((item) => item.sucursalId === sucursalId);
  const cuentasTesoreriaDisponibles = cuentasTesoreria.data ?? [];
  const cuentasOrigen = cuentasTesoreriaDisponibles.filter(
    (cuenta) =>
      cuenta.activa &&
      cuenta.id !== caja?.cuentaTesoreriaId &&
      (cuenta.sucursalId === sucursalId || (todasSucursales && cuenta.sucursalId === null)),
  );
  const cuentasChicaDisponibles = cuentasTesoreriaDisponibles.filter(
    (cuenta) =>
      cuenta.activa &&
      cuenta.tipo === "caja" &&
      cuenta.cuentaCodigo.startsWith("110102") &&
      cuenta.sucursalId === sucursalId,
  );
  const cuentasOrigenApertura = cuentasTesoreriaDisponibles.filter(
    (cuenta) =>
      cuenta.activa && (cuenta.sucursalId === sucursalId || (todasSucursales && cuenta.sucursalId === null)),
  );
  const puedeAbrir = cuentasChicaDisponibles.some((cajaChica) =>
    cuentasOrigenApertura.some((origen) => origen.id !== cajaChica.id),
  );
  const tienePendientes = caja ? Dinero.de(caja.valesPorReintegrar).mayorQue("0.00") : false;

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />

      <div role="tablist" aria-label={T.titulo} className="flex gap-1 overflow-x-auto border-b border-border">
        <button
          id="pestana-caja-chica"
          type="button"
          role="tab"
          aria-selected={pestana === "caja-chica"}
          aria-controls="panel-caja-chica"
          className={`-mb-px flex h-11 items-center border-b-2 px-4 font-semibold whitespace-nowrap ${pestana === "caja-chica" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          onClick={() => setPestana("caja-chica")}
        >
          {T.pestañas.cajaChica}
        </button>
        <button
          id="pestana-cheques"
          type="button"
          role="tab"
          aria-selected={pestana === "cheques"}
          aria-controls="panel-cheques"
          className={`-mb-px flex h-11 items-center border-b-2 px-4 font-semibold whitespace-nowrap ${pestana === "cheques" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          onClick={() => setPestana("cheques")}
        >
          {T.pestañas.cheques}
        </button>
        <button
          id="pestana-conciliacion"
          type="button"
          role="tab"
          aria-selected={pestana === "conciliacion"}
          aria-controls="panel-conciliacion"
          className={`-mb-px flex h-11 items-center border-b-2 px-4 font-semibold whitespace-nowrap ${pestana === "conciliacion" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          onClick={() => setPestana("conciliacion")}
        >
          {T.pestañas.conciliacion}
        </button>
      </div>

      {pestana === "caja-chica" && (
        <section
          id="panel-caja-chica"
          role="tabpanel"
          aria-labelledby="pestana-caja-chica"
          className="grid gap-5"
        >
          {!puedeVer ? (
            <Alert>{T.sinPermiso}</Alert>
          ) : (
            <>
              {sucursalesSelector.length > 1 && (
                <Campo id="caja-chica-sucursal-filtro" etiqueta={T.sucursal}>
                  {(p) => (
                    <NativeSelect
                      {...p}
                      className="h-10 max-w-sm"
                      value={sucursalId}
                      onChange={(evento) => setSucursalElegida(evento.target.value)}
                    >
                      {sucursalesSelector.map((sucursal) => (
                        <option key={sucursal.id} value={sucursal.id}>
                          {sucursal.nombre}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Campo>
              )}

              {cajas.isPending && (
                <p role="status" className="text-muted-foreground">
                  {T.cargando}
                </p>
              )}
              {cajas.isError && (
                <Alert variant="error">
                  <p>
                    {T.errorCarga} {mensajeDeError(cajas.error)}
                  </p>
                  {!(cajas.error instanceof ErrorApi && cajas.error.estado === 403) && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => void cajas.refetch()}>
                      {T.reintentar}
                    </Button>
                  )}
                </Alert>
              )}

              {cajas.isSuccess && !caja && (
                <Card className="flex flex-col items-center gap-4 p-10 text-center text-muted-foreground">
                  <Wallet aria-hidden="true" className="size-8" />
                  <p>
                    {sucursalId
                      ? T.sinCaja
                      : sucursalesSelector.length === 0
                        ? T.sinSucursales
                        : T.elegirSucursal}
                  </p>
                  {puedeRegistrar && sucursalId !== "" && (
                    <>
                      {cuentasChicaDisponibles.length === 0 && <p>{T.sinCuentasCaja}</p>}
                      {!puedeAbrir && <p>{T.sinCuentasOrigen}</p>}
                      <Button onClick={() => setDialogo("apertura")} disabled={!puedeAbrir}>
                        {T.abrir}
                      </Button>
                    </>
                  )}
                </Card>
              )}

              {cajas.isSuccess && caja && (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Card className="p-5">
                      <p className="text-sm text-muted-foreground">{T.fondoFijo}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {formatearDinero(caja.fondoFijo)}
                      </p>
                    </Card>
                    <Card className="p-5">
                      <p className="text-sm text-muted-foreground">{T.valesPendientes}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {formatearDinero(caja.valesPorReintegrar)}
                      </p>
                    </Card>
                    <Card className="p-5">
                      <p className="text-sm text-muted-foreground">{T.efectivoDisponible}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {formatearDinero(caja.efectivoDisponible)}
                      </p>
                    </Card>
                  </div>

                  {puedeRegistrar && (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setDialogo("vale")}>{T.registrar}</Button>
                      <Button
                        variant="outline"
                        onClick={() => setDialogo("reintegro")}
                        disabled={!tienePendientes || cuentasOrigen.length === 0}
                      >
                        {T.reintegrar}
                      </Button>
                    </div>
                  )}

                  {puedeRegistrar && cuentasTesoreria.isError && (
                    <Alert variant="error">{mensajeDeError(cuentasTesoreria.error)}</Alert>
                  )}
                  {puedeRegistrar && catalogo.isError && (
                    <Alert variant="error">{mensajeDeError(catalogo.error)}</Alert>
                  )}

                  <Card className="overflow-hidden">
                    {caja.vales.length === 0 ? (
                      <p className="p-8 text-center text-muted-foreground">{T.sinVales}</p>
                    ) : (
                      <Table className="min-w-[850px]" aria-label={T.pestañas.cajaChica}>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{T.columnas.fecha}</TableHead>
                            <TableHead>{T.columnas.comprobante}</TableHead>
                            <TableHead>{T.columnas.concepto}</TableHead>
                            <TableHead className="text-right">{T.columnas.neto}</TableHead>
                            <TableHead className="text-right">{T.columnas.iva}</TableHead>
                            <TableHead>{T.columnas.estado}</TableHead>
                            <TableHead className="text-right">{T.columnas.total}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {caja.vales.map((vale) => (
                            <TableRow key={vale.id}>
                              <TableCell className="tabular-nums">{formatearFecha(vale.fecha)}</TableCell>
                              <TableCell className="tabular-nums">{vale.comprobante}</TableCell>
                              <TableCell>{vale.concepto}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatearDinero(vale.montoNeto)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatearDinero(vale.iva)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={vale.estado === "reintegrado" ? "solida" : "neutra"}>
                                  {T.estados[vale.estado]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {formatearDinero(vale.total)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={6}>{T.total}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {formatearDinero(caja.totalVales)}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    )}
                  </Card>
                </>
              )}
            </>
          )}
        </section>
      )}

      {pestana === "cheques" && (
        <div id="panel-cheques" role="tabpanel" aria-labelledby="pestana-cheques">
          <PantallaMovimientosBancarios parametros={parametros} />
        </div>
      )}
      {pestana === "conciliacion" && (
        <div id="panel-conciliacion" role="tabpanel" aria-labelledby="pestana-conciliacion">
          <PantallaConciliacionBancaria parametros={parametros} />
        </div>
      )}

      {pestana === "caja-chica" && puedeRegistrar && (
        <>
          <FormularioAperturaCajaChica
            empresaId={empresaId}
            sucursalId={sucursalId}
            sucursales={sucursalesVisibles}
            cuentasTesoreria={cuentasTesoreriaDisponibles}
            todasSucursales={todasSucursales}
            abierto={dialogo === "apertura"}
            onCerrar={() => setDialogo(null)}
          />
          {caja && (
            <>
              <FormularioValeCajaChica
                empresaId={empresaId}
                cajaChicaId={caja.id}
                cuentas={catalogo.data ?? []}
                abierto={dialogo === "vale"}
                onCerrar={() => setDialogo(null)}
              />
              <FormularioReintegroCajaChica
                empresaId={empresaId}
                cajaChicaId={caja.id}
                cuentasOrigen={cuentasOrigen}
                abierto={dialogo === "reintegro"}
                onCerrar={() => setDialogo(null)}
              />
            </>
          )}
        </>
      )}
    </Pagina>
  );
}
