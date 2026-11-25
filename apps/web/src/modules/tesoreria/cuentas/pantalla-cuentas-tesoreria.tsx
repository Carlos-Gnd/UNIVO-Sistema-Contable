import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Pencil, Plus, Power, Wallet } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { Dinero, type CuentaTesoreriaVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero } from "@/lib/formato";
import { cuentasQuery, sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { cuentasTesoreriaQuery, useEditarCuentaTesoreria } from "./cuentas-tesoreria-api";
import { FormularioCuentaTesoreria } from "./formulario-cuenta-tesoreria";
import { TEXTOS_CUENTAS_TESORERIA as T } from "./textos";

type Formulario = { tipo: "nueva" } | { tipo: "editar"; cuenta: CuentaTesoreriaVista } | null;

/** Cajas y cuentas bancarias con su saldo actual (HU-76, S3-T113). */
export function PantallaCuentasTesoreria({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("tesoreria.ver");
  const puedeRegistrar = usePermiso("tesoreria.registrar");
  const [formulario, setFormulario] = useState<Formulario>(null);
  const cuentas = useQuery({ ...cuentasTesoreriaQuery(empresaId), enabled: puedeVer });
  const catalogo = useQuery({ ...cuentasQuery(empresaId), enabled: puedeVer && puedeRegistrar });
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer && puedeRegistrar });
  const editar = useEditarCuentaTesoreria(empresaId);
  const usadas = useMemo(() => new Set((cuentas.data ?? []).map((c) => c.cuentaId)), [cuentas.data]);
  const efectivoTotal = useMemo(
    () => Dinero.sumar((cuentas.data ?? []).filter((c) => c.activa).map((c) => c.saldo)).aTexto(),
    [cuentas.data],
  );

  function cambiarEstado(cuenta: CuentaTesoreriaVista, activa: boolean) {
    editar.mutate(
      { id: cuenta.id, cambios: { activa } },
      {
        onSuccess: () => toast.success(activa ? T.activada(cuenta.nombre) : T.inactivada(cuenta.nombre)),
        onError: (error) => toast.error(mensajeDeError(error)),
      },
    );
  }

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeRegistrar && puedeVer && (
          <Button className="h-11 rounded-full px-5" onClick={() => setFormulario({ tipo: "nueva" })}>
            <Plus aria-hidden="true" />
            {T.nueva}
          </Button>
        )}
      </EncabezadoPagina>

      {!puedeVer ? (
        <Alert>{T.sinPermiso}</Alert>
      ) : (
        <>
          {cuentas.isPending && (
            <p role="status" className="text-muted-foreground">
              {T.cargando}
            </p>
          )}
          {cuentas.isError && (
            <Alert variant="error">
              <p>
                {T.errorCarga} {mensajeDeError(cuentas.error)}
              </p>
              {!(cuentas.error instanceof ErrorApi && cuentas.error.estado === 403) && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void cuentas.refetch()}>
                  {T.reintentar}
                </Button>
              )}
            </Alert>
          )}

          {cuentas.isSuccess && cuentas.data.length === 0 && (
            <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
              <Wallet aria-hidden="true" className="size-8" />
              <p>{T.vacio}</p>
            </Card>
          )}

          {cuentas.isSuccess && cuentas.data.length > 0 && (
            <>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{T.efectivoTotal}</p>
                  <p className="text-2xl font-semibold tabular-nums" aria-label={T.efectivoTotal}>
                    {formatearDinero(efectivoTotal)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{T.efectivoTotalAyuda}</p>
              </Card>
              <Card className="overflow-hidden">
                <Table className="min-w-[900px]" aria-label={T.titulo}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{T.columnas.nombre}</TableHead>
                      <TableHead>{T.columnas.tipo}</TableHead>
                      <TableHead>{T.columnas.cuentaBancaria}</TableHead>
                      <TableHead>{T.columnas.cuentaContable}</TableHead>
                      <TableHead>{T.columnas.sucursal}</TableHead>
                      <TableHead className="text-right">{T.columnas.saldo}</TableHead>
                      <TableHead>{T.columnas.estado}</TableHead>
                      {puedeRegistrar && <TableHead className="text-right">{T.columnas.acciones}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cuentas.data.map((c) => (
                      <TableRow key={c.id} className={cn(!c.activa && "opacity-60")}>
                        <TableCell className="font-medium">{c.nombre}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            {c.tipo === "banco" ? (
                              <Landmark aria-hidden="true" className="size-4" />
                            ) : (
                              <Wallet aria-hidden="true" className="size-4" />
                            )}
                            {T.tipo[c.tipo]}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.banco ? (
                            <>
                              {c.banco} <span className="tabular-nums">{c.numeroCuenta}</span>
                            </>
                          ) : (
                            ""
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{c.cuentaCodigo}</span> {c.cuentaNombre}
                        </TableCell>
                        <TableCell>{c.sucursal ?? T.toda}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatearDinero(c.saldo)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.activa ? "solida" : "neutra"}>
                            {c.activa ? T.activa : T.inactiva}
                          </Badge>
                        </TableCell>
                        {puedeRegistrar && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-muted-foreground"
                              aria-label={T.editar(c.nombre)}
                              onClick={() => setFormulario({ tipo: "editar", cuenta: c })}
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-muted-foreground"
                              aria-label={c.activa ? T.inactivar(c.nombre) : T.activar(c.nombre)}
                              disabled={editar.isPending}
                              onClick={() => cambiarEstado(c, !c.activa)}
                            >
                              <Power aria-hidden="true" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </>
      )}

      {puedeRegistrar && (
        <FormularioCuentaTesoreria
          empresaId={empresaId}
          cuenta={formulario?.tipo === "editar" ? formulario.cuenta : undefined}
          catalogo={catalogo.data ?? []}
          cuentasUsadas={usadas}
          sucursales={sucursales.data ?? []}
          abierto={formulario !== null}
          onCerrar={() => setFormulario(null)}
        />
      )}
    </Pagina>
  );
}
