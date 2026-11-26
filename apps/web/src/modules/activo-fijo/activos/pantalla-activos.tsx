import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building, Plus } from "lucide-react";
import { Dinero, type ActivoFijoVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { cuentasQuery, sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { Permiso, usePermiso } from "@/modules/organizacion/permisos";
import { activosQuery } from "./activos-api";
import { DialogoActivo } from "./dialogo-activo";
import { DialogoBaja } from "./dialogo-baja";
import { CATEGORIAS, TEXTOS_ACTIVOS as T } from "./textos";

const dinero = (monto: string) => formatearDinero(monto, { simbolo: false });

function DetalleActivo({
  activo,
  onCerrar,
  onBaja,
}: {
  activo: ActivoFijoVista | undefined;
  onCerrar: () => void;
  onBaja: (activo: ActivoFijoVista) => void;
}) {
  const C = T.detalle.campos;
  const filas = activo
    ? [
        [C.categoria, CATEGORIAS[activo.categoria]],
        [C.adquisicion, formatearFecha(activo.fechaAdquisicion)],
        [C.costo, formatearDinero(activo.costo)],
        [C.residual, formatearDinero(activo.valorResidual)],
        [C.vida, T.anios(activo.vidaUtilAnios)],
        [C.tasa, `${activo.tasaAnual} %`],
        [C.acumulada, formatearDinero(activo.depreciacionAcumulada)],
        [C.enLibros, formatearDinero(activo.valorEnLibros)],
        [
          C.cuentas,
          T.detalle.cuentas(
            activo.cuentaActivo.codigo,
            activo.cuentaDepreciacion.codigo,
            activo.cuentaGasto.codigo,
          ),
        ],
        ...(activo.fechaBaja ? [[C.baja, formatearFecha(activo.fechaBaja)]] : []),
      ]
    : [];
  return (
    <Dialog open={activo !== undefined} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        {activo && (
          <>
            <DialogHeader>
              <DialogTitle>{activo.nombre}</DialogTitle>
              <DialogDescription>
                {T.detalle.descripcion(activo.codigo, activo.sucursalNombre)}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid gap-2.5 text-sm">
              {filas.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCerrar}>
                {T.detalle.cerrar}
              </Button>
              {activo.estado === "activo" && (
                <Permiso requiere="activo_fijo.registrar">
                  <Button type="button" variant="destructive" onClick={() => onBaja(activo)}>
                    {T.detalle.darDeBaja}
                  </Button>
                </Permiso>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Pantalla de activos fijos: costo, vida útil, valor residual y baja con su partida (S3-T128, HU-81). */
export function PantallaActivos({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const activos = useQuery(activosQuery(empresaId));
  const puedeRegistrar = usePermiso("activo_fijo.registrar");
  // El catálogo y las sucursales solo hacen falta para el formulario de alta
  const cuentas = useQuery({ ...cuentasQuery(empresaId), enabled: puedeRegistrar });
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeRegistrar });
  const [nuevo, setNuevo] = useState(false);
  const [detalle, setDetalle] = useState<ActivoFijoVista>();
  const [aBaja, setABaja] = useState<ActivoFijoVista>();

  const lista = activos.data ?? [];
  const costoTotal = Dinero.sumar(lista.filter((a) => a.estado === "activo").map((a) => a.costo));
  const botonNuevo = puedeRegistrar && (
    <Button
      className="h-11 rounded-full px-5"
      onClick={() => setNuevo(true)}
      disabled={!cuentas.data || !sucursales.data}
    >
      <Plus aria-hidden="true" />
      {T.nuevo}
    </Button>
  );

  return (
    <Pagina>
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {botonNuevo}
      </EncabezadoPagina>

      {activos.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {activos.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(activos.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void activos.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {activos.isSuccess && lista.length === 0 && (
        <Card className="grid justify-items-center gap-3 p-14 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-secondary">
            <Building className="size-6" />
          </span>
          <h2 className="text-lg text-foreground">{T.vacioTitulo}</h2>
          <p className="max-w-md text-muted-foreground">{T.vacioDescripcion}</p>
          {botonNuevo}
        </Card>
      )}

      {lista.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.tabla.codigo}</TableHead>
                <TableHead>{T.tabla.activo}</TableHead>
                <TableHead>{T.tabla.sucursal}</TableHead>
                <TableHead>{T.tabla.adquisicion}</TableHead>
                <TableHead className="text-right">{T.tabla.vida}</TableHead>
                <TableHead className="text-right">{T.tabla.residual}</TableHead>
                <TableHead className="text-right">{T.tabla.costo}</TableHead>
                <TableHead className="text-right">{T.tabla.enLibros}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{a.codigo}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setDetalle(a)}
                      aria-label={T.tabla.verDetalle(a.codigo)}
                      className="flex items-center gap-2 text-left font-semibold hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {a.nombre}
                      {a.estado === "de_baja" && <Badge>{T.tabla.deBaja}</Badge>}
                    </button>
                  </TableCell>
                  <TableCell>{a.sucursalNombre}</TableCell>
                  <TableCell className="tabular-nums">{formatearFecha(a.fechaAdquisicion)}</TableCell>
                  <TableCell className="text-right tabular-nums">{T.anios(a.vidaUtilAnios)}</TableCell>
                  <TableCell className="text-right tabular-nums">{dinero(a.valorResidual)}</TableCell>
                  <TableCell className="text-right tabular-nums">{dinero(a.costo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{dinero(a.valorEnLibros)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6}>{T.tabla.totalCosto}</TableCell>
                <TableCell className="text-right tabular-nums">{dinero(costoTotal.aTexto())}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}

      {cuentas.data && sucursales.data && (
        <DialogoActivo
          empresaId={empresaId}
          abierto={nuevo}
          sucursales={sucursales.data}
          cuentas={cuentas.data}
          onCerrar={() => setNuevo(false)}
        />
      )}
      <DetalleActivo
        activo={detalle}
        onCerrar={() => setDetalle(undefined)}
        onBaja={(a) => {
          setDetalle(undefined);
          setABaja(a);
        }}
      />
      <DialogoBaja empresaId={empresaId} activo={aBaja} onCerrar={() => setABaja(undefined)} />
    </Pagina>
  );
}
