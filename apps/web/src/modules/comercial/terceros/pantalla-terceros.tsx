import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Contact, Pencil, Plus, Power, Upload } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import type { RolTercero, TerceroVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { DialogoImportacionTerceros } from "./dialogo-importacion";
import { FormularioTercero } from "./formulario-tercero";
import { tercerosQuery, useEditarTercero, type FiltrosTerceros } from "./terceros-api";
import { TEXTOS_TERCEROS as T } from "./textos";
import { TEXTOS_IMPORTACION_TERCEROS } from "./textos-importacion";

type Formulario = { tipo: "nuevo" } | { tipo: "editar"; tercero: TerceroVista } | null;
const ROLES: readonly RolTercero[] = ["cliente", "proveedor"];

/** Pantalla de clientes y proveedores (HU-58, S3-T59): pestañas, búsqueda y alta con NIT y NRC validados. */
export function PantallaTerceros({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeRegistrar = usePermiso("terceros.registrar");
  const [filtros, setFiltros] = useState<FiltrosTerceros>({ rol: "cliente", busqueda: "", estado: "todos" });
  const [formulario, setFormulario] = useState<Formulario>(null);
  const [importando, setImportando] = useState(false);
  const terceros = useQuery(tercerosQuery(empresaId, filtros));
  const editar = useEditarTercero(empresaId);
  const hayFiltros = filtros.busqueda !== "" || filtros.estado !== "todos";

  function cambiarEstado(tercero: TerceroVista, activo: boolean) {
    editar.mutate(
      { id: tercero.id, cambios: { activo } },
      {
        onSuccess: () => toast.success(activo ? T.activado(tercero.nombre) : T.inactivado(tercero.nombre)),
        onError: (error) => toast.error(mensajeDeError(error)),
      },
    );
  }

  return (
    <Pagina className="max-w-[1120px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeRegistrar && (
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setImportando(true)}>
            <Upload aria-hidden="true" />
            {TEXTOS_IMPORTACION_TERCEROS.boton}
          </Button>
        )}
        {puedeRegistrar && (
          <Button className="h-11 rounded-full px-5" onClick={() => setFormulario({ tipo: "nuevo" })}>
            <Plus aria-hidden="true" />
            {T.nuevo(filtros.rol)}
          </Button>
        )}
      </EncabezadoPagina>

      <div role="group" aria-label={T.pestanas.etiqueta} className="flex gap-2">
        {ROLES.map((rol) => (
          <Button
            key={rol}
            type="button"
            variant={filtros.rol === rol ? "default" : "outline"}
            className="h-10 rounded-full px-5"
            aria-pressed={filtros.rol === rol}
            onClick={() => setFiltros((f) => ({ ...f, rol }))}
          >
            {T.pestanas[rol]}
          </Button>
        ))}
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr]">
        <Input
          type="search"
          aria-label={T.filtros.busqueda}
          placeholder={T.filtros.busqueda}
          className="h-10"
          value={filtros.busqueda}
          onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
        />
        <NativeSelect
          aria-label={T.filtros.estado}
          className="h-10"
          value={filtros.estado}
          onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value as FiltrosTerceros["estado"] }))}
        >
          <option value="todos">{T.filtros.todos}</option>
          <option value="activos">{T.filtros.activos}</option>
          <option value="inactivos">{T.filtros.inactivos}</option>
        </NativeSelect>
      </Card>

      {terceros.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {terceros.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(terceros.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void terceros.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {terceros.isSuccess && terceros.data.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <Contact aria-hidden="true" className="size-8" />
          <p>{hayFiltros ? T.sinResultados : T.vacio}</p>
        </Card>
      )}

      {terceros.isSuccess && terceros.data.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.nombre}</TableHead>
                <TableHead>{T.columnas.nit}</TableHead>
                <TableHead>{T.columnas.nrc}</TableHead>
                <TableHead>{T.columnas.actividad}</TableHead>
                <TableHead>{T.columnas.clasificacion}</TableHead>
                <TableHead>{T.columnas.estado}</TableHead>
                {puedeRegistrar && <TableHead className="text-right">{T.columnas.acciones}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {terceros.data.map((t) => (
                <TableRow key={t.id} className={cn(!t.activo && "opacity-60")}>
                  <TableCell className="font-medium">{t.nombre}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{t.nit}</TableCell>
                  <TableCell className="tabular-nums">{t.nrc ?? T.sinDato}</TableCell>
                  <TableCell>{t.actividadEconomica ?? T.sinDato}</TableCell>
                  <TableCell>
                    <Badge variant={t.clasificacion === "grande" ? "solida" : "neutra"}>
                      {T.clasificacion[t.clasificacion]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.activo ? "solida" : "neutra"}>{t.activo ? T.activo : T.inactivo}</Badge>
                  </TableCell>
                  {puedeRegistrar && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={T.editar(t.nombre)}
                        onClick={() => setFormulario({ tipo: "editar", tercero: t })}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={t.activo ? T.inactivar(t.nombre) : T.activar(t.nombre)}
                        disabled={editar.isPending}
                        onClick={() => cambiarEstado(t, !t.activo)}
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
      )}

      <FormularioTercero
        empresaId={empresaId}
        tercero={formulario?.tipo === "editar" ? formulario.tercero : undefined}
        rol={filtros.rol}
        abierto={formulario !== null}
        onCerrar={() => setFormulario(null)}
      />
      <DialogoImportacionTerceros
        empresaId={empresaId}
        abierto={importando}
        onCerrar={() => setImportando(false)}
      />
    </Pagina>
  );
}
