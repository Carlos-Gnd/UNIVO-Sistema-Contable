import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ListTree, LoaderCircle, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { RUTAS, type Parametros } from "@/app/rutas";
import { navegar } from "@/app/navegacion";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { cuentasCatalogoQuery, useEditarCuenta } from "./cuentas-api";
import { FormularioCuenta } from "./formulario-cuenta";
import {
  ETIQUETAS_NATURALEZA,
  ETIQUETAS_TIPO_CUENTA,
  LONGITUDES_CODIGO_CUENTA,
  type CuentaCatalogo,
} from "./tipos";
import { TEXTOS_LISTADO_CUENTAS as T } from "./textos-listado";

const TAMANO_PAGINA = 10;

type FiltroEstado = "todas" | "activas" | "inactivas";
type Formulario = { tipo: "nueva" } | { tipo: "editar"; cuenta: CuentaCatalogo } | null;

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

const indiceNivel = (cuenta: CuentaCatalogo) => {
  const porCodigo = LONGITUDES_CODIGO_CUENTA.indexOf(
    cuenta.codigo.length as (typeof LONGITUDES_CODIGO_CUENTA)[number],
  );
  return porCodigo >= 0 ? porCodigo : cuenta.nivel - 1;
};

/** Listado filtrable y paginado del catálogo empresarial (S1-T64, HU-15). */
export function PantallaCuentas({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const cuentasQuery = useQuery(cuentasCatalogoQuery(empresaId));
  const puedeEditar = usePermiso("catalogo.editar");
  const puedeInactivar = usePermiso("catalogo.inactivar");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("todas");
  const [nivel, setNivel] = useState("todos");
  const [pagina, setPagina] = useState(0);
  const [formulario, setFormulario] = useState<Formulario>(null);
  const [porInactivar, setPorInactivar] = useState<CuentaCatalogo | null>(null);
  const editar = useEditarCuenta(empresaId, porInactivar?.id ?? "");
  const existeVistaArbol = RUTAS.some((ruta) => ruta.patron === "/empresas/:empresaId/catalogo");

  const cuentas = useMemo(() => {
    const term = normalizar(busqueda.trim());
    return [...(cuentasQuery.data ?? [])]
      .filter((cuenta) => {
        const coincideTexto = !term || normalizar(`${cuenta.codigo} ${cuenta.nombre}`).includes(term);
        const coincideEstado = estado === "todas" || cuenta.activa === (estado === "activas");
        const coincideNivel = nivel === "todos" || indiceNivel(cuenta) === Number(nivel);
        return coincideTexto && coincideEstado && coincideNivel;
      })
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  }, [cuentasQuery.data, busqueda, estado, nivel]);

  const totalPaginas = Math.max(1, Math.ceil(cuentas.length / TAMANO_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const visibles = cuentas.slice(paginaActual * TAMANO_PAGINA, (paginaActual + 1) * TAMANO_PAGINA);

  function cambiarEstado(cuenta: CuentaCatalogo, activa: boolean) {
    editar.mutate(
      { activa },
      {
        onSuccess: () => {
          setPorInactivar(null);
          toast.success(activa ? T.confirmar.activada(cuenta.nombre) : T.confirmar.exito(cuenta.nombre));
        },
        onError: (error) => {
          if (porInactivar) return;
          toast.error(error instanceof ErrorApi ? error.message : mensajeDeError(error));
        },
      },
    );
  }

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {existeVistaArbol && (
          <Button
            variant="outline"
            className="h-11 rounded-full px-5"
            onClick={() => navegar(`/empresas/${encodeURIComponent(empresaId)}/catalogo`)}
          >
            <ListTree aria-hidden="true" />
            {T.vistaArbol}
          </Button>
        )}
        {puedeEditar && (
          <Button
            className="h-11 rounded-full px-5"
            disabled={!cuentasQuery.isSuccess}
            onClick={() => setFormulario({ tipo: "nueva" })}
          >
            <Plus aria-hidden="true" />
            {T.nueva}
          </Button>
        )}
      </EncabezadoPagina>

      {cuentasQuery.isPending && (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {T.cargando}
        </p>
      )}
      {cuentasQuery.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(cuentasQuery.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void cuentasQuery.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {cuentasQuery.isSuccess && (
        <Card>
          <CardHeader
            title="Cuentas registradas"
            description={`${cuentasQuery.data.length} cuentas en el catálogo`}
          />
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(220px,1fr)_180px_220px]">
            <div className="grid gap-1.5">
              <label htmlFor="cuentas-busqueda" className="text-sm font-medium">
                {T.buscar}
              </label>
              <Input
                id="cuentas-busqueda"
                type="search"
                placeholder={T.buscar}
                value={busqueda}
                onChange={(evento) => {
                  setBusqueda(evento.currentTarget.value);
                  setPagina(0);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="cuentas-nivel" className="text-sm font-medium">
                {T.filtroNivel}
              </label>
              <NativeSelect
                id="cuentas-nivel"
                value={nivel}
                onChange={(evento) => {
                  setNivel(evento.currentTarget.value);
                  setPagina(0);
                }}
              >
                <option value="todos">{T.todosLosNiveles}</option>
                {T.niveles.map((etiqueta, indice) => (
                  <option key={etiqueta} value={indice}>
                    {etiqueta}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="cuentas-estado" className="text-sm font-medium">
                {T.filtroEstado}
              </label>
              <NativeSelect
                id="cuentas-estado"
                value={estado}
                onChange={(evento) => {
                  setEstado(evento.currentTarget.value as FiltroEstado);
                  setPagina(0);
                }}
              >
                <option value="todas">{T.todos}</option>
                <option value="activas">{T.activas}</option>
                <option value="inactivas">{T.inactivas}</option>
              </NativeSelect>
            </div>
          </div>

          {cuentas.length === 0 ? (
            <p className="p-10 text-center text-muted-foreground">
              {cuentasQuery.data.length === 0 ? T.vacio : T.sinResultados}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{T.codigo}</TableHead>
                    <TableHead>{T.nombre}</TableHead>
                    <TableHead>{T.naturaleza}</TableHead>
                    <TableHead>{T.nivel}</TableHead>
                    <TableHead>{T.tipo}</TableHead>
                    <TableHead>{T.estado}</TableHead>
                    {(puedeEditar || puedeInactivar) && (
                      <TableHead className="text-right">{T.acciones}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((cuenta) => {
                    const nivelCuenta = indiceNivel(cuenta);
                    return (
                      <TableRow key={cuenta.id} className={cn(!cuenta.activa && "opacity-60")}>
                        <TableCell className="font-mono tabular-nums">{cuenta.codigo}</TableCell>
                        <TableCell className="min-w-48 font-medium">{cuenta.nombre}</TableCell>
                        <TableCell>{ETIQUETAS_NATURALEZA[cuenta.naturaleza]}</TableCell>
                        <TableCell>{T.niveles[nivelCuenta] ?? cuenta.nivel}</TableCell>
                        <TableCell>{ETIQUETAS_TIPO_CUENTA[cuenta.tipo]}</TableCell>
                        <TableCell>
                          <Badge variant={cuenta.activa ? "solida" : "neutra"}>
                            {cuenta.activa ? T.activa : T.inactiva}
                          </Badge>
                        </TableCell>
                        {(puedeEditar || puedeInactivar) && (
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {puedeEditar && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={T.editar(cuenta.nombre)}
                                  onClick={() => setFormulario({ tipo: "editar", cuenta })}
                                >
                                  <Pencil aria-hidden="true" />
                                </Button>
                              )}
                              {puedeInactivar && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={
                                    cuenta.activa ? T.inactivar(cuenta.nombre) : T.activar(cuenta.nombre)
                                  }
                                  disabled={editar.isPending}
                                  onClick={() =>
                                    cuenta.activa ? setPorInactivar(cuenta) : cambiarEstado(cuenta, true)
                                  }
                                >
                                  <Power aria-hidden="true" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {T.pagina(paginaActual + 1, totalPaginas, cuentas.length)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={paginaActual === 0}
                    onClick={() => setPagina((actual) => Math.max(0, actual - 1))}
                  >
                    <ChevronLeft aria-hidden="true" />
                    {T.anterior}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={paginaActual >= totalPaginas - 1}
                    onClick={() => setPagina((actual) => Math.min(totalPaginas - 1, actual + 1))}
                  >
                    {T.siguiente}
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      <FormularioCuenta
        empresaId={empresaId}
        cuentas={cuentasQuery.data ?? []}
        abierto={formulario !== null}
        cuenta={formulario?.tipo === "editar" ? formulario.cuenta : undefined}
        onCerrar={() => setFormulario(null)}
        onGuardado={() => setFormulario(null)}
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
              {editar.isPending ? T.guardando : T.confirmar.inactivar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}
