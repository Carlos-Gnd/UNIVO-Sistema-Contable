import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, LoaderCircle, MapPin, Pencil, Plus, Power } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import type { SucursalDetalle } from "@contable/shared";
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
import { mensajeDeError } from "@/lib/api";
import { usePermiso, usePermisos } from "@/modules/organizacion/permisos";
import { FormularioSucursal } from "./formulario-sucursal";
import { ordenarSucursales, sucursalesQuery, useEditarSucursal } from "./sucursales-api";
import { TEXTOS_SUCURSALES as T } from "./textos";

type Formulario = { tipo: "nueva" } | { tipo: "editar"; sucursal: SucursalDetalle } | null;

/** Pantalla de sucursales de la empresa (S1-T45, HU-07). */
export function PantallaSucursales({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const puedeGestionar = usePermiso("sucursales.gestionar");
  // Quien solo ve algunas sucursales no crea nuevas: no tendría acceso a la que crea (regla de la API)
  const { todasSucursales } = usePermisos();
  const [formulario, setFormulario] = useState<Formulario>(null);
  const [porInactivar, setPorInactivar] = useState<SucursalDetalle | null>(null);
  const editar = useEditarSucursal(empresaId);

  function cambiarEstado(sucursal: SucursalDetalle, activa: boolean) {
    editar.mutate(
      { id: sucursal.id, cambios: { activa } },
      {
        onSuccess: () => {
          setPorInactivar(null);
          toast.success(
            activa ? T.confirmar.activada(sucursal.nombre) : T.confirmar.inactivada(sucursal.nombre),
          );
        },
        // Activar no abre diálogo: el error se avisa con un toast
        onError: (error) => !porInactivar && toast.error(mensajeDeError(error)),
      },
    );
  }

  return (
    <Pagina className="max-w-[1120px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeGestionar && todasSucursales && (
          <Button className="h-11 rounded-full px-5" onClick={() => setFormulario({ tipo: "nueva" })}>
            <Plus aria-hidden="true" />
            {T.nueva}
          </Button>
        )}
      </EncabezadoPagina>

      {sucursales.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {sucursales.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(sucursales.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void sucursales.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {sucursales.isSuccess && (
        <ul className="grid gap-3" aria-label={T.titulo}>
          {ordenarSucursales(sucursales.data).map((s) => (
            <li key={s.id}>
              <Card
                className={cn("flex flex-wrap items-center gap-4 p-4 sm:px-5", !s.activa && "opacity-60")}
              >
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-foreground"
                >
                  {s.esMatriz ? <Building2 className="size-5" /> : <MapPin className="size-5" />}
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-foreground">{s.nombre}</h2>
                    {s.esMatriz && <Badge variant="solida">{T.casaMatriz}</Badge>}
                    {!s.activa && <Badge variant="neutra">{T.inactiva}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{s.direccion ?? T.sinDireccion}</p>
                </div>
                <dl className="flex gap-6 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{T.establecimiento}</dt>
                    <dd className="tabular-nums">{s.codigoEstablecimiento}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{T.puntoVenta}</dt>
                    <dd className="tabular-nums">{s.codigoPuntoVenta}</dd>
                  </div>
                </dl>
                {puedeGestionar && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-muted-foreground"
                      aria-label={T.editar(s.nombre)}
                      onClick={() => setFormulario({ tipo: "editar", sucursal: s })}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    {!s.esMatriz && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={s.activa ? T.inactivar(s.nombre) : T.activar(s.nombre)}
                        disabled={editar.isPending}
                        onClick={() => (s.activa ? setPorInactivar(s) : cambiarEstado(s, true))}
                      >
                        <Power aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {sucursales.isSuccess && sucursales.data.length === 0 && (
        <p className="p-10 text-center text-muted-foreground">{T.vacio}</p>
      )}
      {sucursales.isSuccess && <Alert>{T.avisoMatriz}</Alert>}

      <FormularioSucursal
        empresaId={empresaId}
        abierto={formulario !== null}
        sucursal={formulario?.tipo === "editar" ? formulario.sucursal : undefined}
        onCerrar={() => setFormulario(null)}
      />

      <Dialog
        open={porInactivar !== null}
        onOpenChange={(abierto) => {
          if (!abierto && !editar.isPending) {
            setPorInactivar(null);
            editar.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{porInactivar && T.confirmar.titulo(porInactivar.nombre)}</DialogTitle>
            <DialogDescription>{T.confirmar.descripcion}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{T.confirmar.usuarios}</p>
          {editar.isError && <Alert variant="error">{mensajeDeError(editar.error)}</Alert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPorInactivar(null)} disabled={editar.isPending}>
              {T.confirmar.cancelar}
            </Button>
            <Button
              variant="destructive"
              disabled={editar.isPending}
              onClick={() => porInactivar && cambiarEstado(porInactivar, false)}
            >
              {editar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {T.confirmar.inactivar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}
