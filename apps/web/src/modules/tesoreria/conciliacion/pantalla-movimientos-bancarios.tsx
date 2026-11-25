import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Plus } from "lucide-react";
import { type CuentaTesoreriaVista, type MovimientoBancarioVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Campo } from "@/components/campo";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { cuentasQuery, sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { usePermiso, usePermisos } from "@/modules/organizacion/permisos";
import { cuentasTesoreriaQuery } from "../cuentas/cuentas-tesoreria-api";
import { FormularioMovimientoBancario } from "./formulario-movimiento-bancario";
import { movimientosBancariosQuery, useCambiarEstadoCheque } from "./movimientos-bancarios-api";
import { TEXTOS_CAJA_CHICA as T } from "./textos";

function periodoInicial() {
  const hoy = hoyIso();
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}

export function PantallaMovimientosBancarios({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("tesoreria.ver");
  const puedeRegistrar = usePermiso("tesoreria.registrar");
  const { todasSucursales, sucursales: sucursalesAsignadas } = usePermisos();
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [cuentaId, setCuentaId] = useState("");
  const [fechas, setFechas] = useState(periodoInicial);
  const bancosQuery = useQuery({ ...cuentasTesoreriaQuery(empresaId), enabled: puedeVer });
  const catalogoQuery = useQuery({ ...cuentasQuery(empresaId), enabled: puedeRegistrar });
  const sucursalesQueryResult = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeRegistrar });
  const bancos = useMemo(
    () => (bancosQuery.data ?? []).filter((cuenta) => cuenta.tipo === "banco" && cuenta.activa),
    [bancosQuery.data],
  );
  const cuentaElegida = cuentaId || bancos[0]?.id || "";
  const movimientos = useQuery({
    ...movimientosBancariosQuery(
      empresaId,
      { cuentaTesoreriaId: cuentaElegida, desde: fechas.desde, hasta: fechas.hasta },
      puedeVer && Boolean(cuentaElegida) && fechas.hasta >= fechas.desde,
    ),
  });
  const cambiarEstado = useCambiarEstadoCheque(empresaId, cuentaElegida, fechas.desde, fechas.hasta);
  const sucursales = useMemo(
    () =>
      (sucursalesQueryResult.data ?? []).filter(
        (sucursal) => sucursal.activa && (todasSucursales || sucursalesAsignadas.includes(sucursal.id)),
      ),
    [sucursalesQueryResult.data, sucursalesAsignadas, todasSucursales],
  );
  const cuentasDisponibles = bancosQuery.data ?? [];
  const fechaEstado = hoyIso();

  return (
    <section className="grid gap-5" aria-labelledby="titulo-movimientos-bancarios">
      <div>
        <h2 id="titulo-movimientos-bancarios" className="text-xl font-semibold">
          {T.movimientos.titulo}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{T.movimientos.descripcion}</p>
      </div>
      {!puedeVer ? (
        <Alert>{T.movimientos.sinPermiso}</Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <Campo id="movimientos-banco-filtro" etiqueta={T.movimientos.banco}>
              {(p) => (
                <NativeSelect
                  {...p}
                  className="h-10 min-w-64"
                  value={cuentaElegida}
                  onChange={(e) => setCuentaId(e.target.value)}
                >
                  <option value="">{T.movimientos.banco}</option>
                  {bancos.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.nombre}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Campo>
            <Campo id="movimientos-desde" etiqueta={T.movimientos.desde}>
              {(p) => (
                <Input
                  {...p}
                  className="h-10"
                  type="date"
                  value={fechas.desde}
                  onChange={(e) => setFechas((previas) => ({ ...previas, desde: e.target.value }))}
                />
              )}
            </Campo>
            <Campo id="movimientos-hasta" etiqueta={T.movimientos.hasta}>
              {(p) => (
                <Input
                  {...p}
                  className="h-10"
                  type="date"
                  value={fechas.hasta}
                  onChange={(e) => setFechas((previas) => ({ ...previas, hasta: e.target.value }))}
                />
              )}
            </Campo>
            {puedeRegistrar && (
              <Button onClick={() => setDialogoAbierto(true)} disabled={bancos.length === 0}>
                <Plus aria-hidden="true" /> {T.movimientos.registrar}
              </Button>
            )}
          </div>
          {bancosQuery.isError && <Alert variant="error">{mensajeDeError(bancosQuery.error)}</Alert>}
          {bancosQuery.isSuccess && bancos.length === 0 && (
            <Alert>No hay cuentas bancarias activas en esta empresa.</Alert>
          )}
          {movimientos.isPending && (
            <p role="status" className="text-muted-foreground">
              {T.movimientos.cargando}
            </p>
          )}
          {movimientos.isError && (
            <Alert variant="error">
              <p>
                {T.movimientos.error} {mensajeDeError(movimientos.error)}
              </p>
              {!(movimientos.error instanceof ErrorApi && movimientos.error.estado === 403) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void movimientos.refetch()}
                >
                  {T.movimientos.reintentar}
                </Button>
              )}
            </Alert>
          )}
          {movimientos.isSuccess &&
            (movimientos.data.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                <Landmark aria-hidden="true" className="size-8" />
                <p>{T.movimientos.vacio}</p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table className="min-w-[1100px]" aria-label={T.movimientos.titulo}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{T.movimientos.columnas.fecha}</TableHead>
                      <TableHead>{T.movimientos.columnas.tipo}</TableHead>
                      <TableHead>{T.movimientos.columnas.referencia}</TableHead>
                      <TableHead>{T.movimientos.columnas.comprobante}</TableHead>
                      <TableHead>{T.movimientos.columnas.beneficiario}</TableHead>
                      <TableHead>{T.movimientos.columnas.concepto}</TableHead>
                      <TableHead className="text-right">{T.movimientos.columnas.monto}</TableHead>
                      <TableHead>{T.movimientos.columnas.estado}</TableHead>
                      <TableHead>{T.movimientos.columnas.partida}</TableHead>
                      {puedeRegistrar && <TableHead>{T.movimientos.columnas.acciones}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.data.map((movimiento) => (
                      <TableRow key={movimiento.id}>
                        <TableCell className="tabular-nums">{formatearFecha(movimiento.fecha)}</TableCell>
                        <TableCell>{T.movimientos.tipos[movimiento.tipo]}</TableCell>
                        <TableCell className="tabular-nums">{movimiento.referencia}</TableCell>
                        <TableCell className="tabular-nums">{movimiento.comprobante}</TableCell>
                        <TableCell>{movimiento.beneficiario ?? ""}</TableCell>
                        <TableCell>{movimiento.concepto}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatearDinero(movimiento.monto)}
                        </TableCell>
                        <TableCell>
                          {movimiento.estadoCheque ? (
                            <Badge variant={movimiento.estadoCheque === "emitido" ? "neutra" : "solida"}>
                              {T.movimientos.estados[movimiento.estadoCheque]}
                            </Badge>
                          ) : (
                            "No aplica"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutra">
                            {movimiento.partidaEstado === "borrador" ? "Borrador" : movimiento.partidaEstado}
                          </Badge>
                        </TableCell>
                        {puedeRegistrar && (
                          <TableCell>
                            {movimiento.estadoCheque === "emitido" && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={cambiarEstado.isPending}
                                  onClick={() =>
                                    actualizarEstado(cambiarEstado, movimiento, "cobrado", fechaEstado)
                                  }
                                >
                                  {T.movimientos.cobrado}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={cambiarEstado.isPending}
                                  onClick={() =>
                                    actualizarEstado(cambiarEstado, movimiento, "anulado", fechaEstado)
                                  }
                                >
                                  {T.movimientos.anular}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ))}
          {cambiarEstado.error && <Alert variant="error">{mensajeDeError(cambiarEstado.error)}</Alert>}
        </>
      )}
      {puedeRegistrar && (
        <FormularioMovimientoBancario
          empresaId={empresaId}
          abierto={dialogoAbierto}
          cuentas={cuentasDisponibles as CuentaTesoreriaVista[]}
          catalogo={catalogoQuery.data ?? []}
          sucursales={sucursales}
          onCerrar={() => setDialogoAbierto(false)}
        />
      )}
    </section>
  );
}

function actualizarEstado(
  mutation: ReturnType<typeof useCambiarEstadoCheque>,
  movimiento: MovimientoBancarioVista,
  estado: "cobrado" | "anulado",
  fecha: string,
) {
  mutation.mutate({ id: movimiento.id, datos: { estado, fecha } });
}
