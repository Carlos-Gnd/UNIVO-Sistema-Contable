import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IdCard, Pencil, Plus, Power } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import type { EmpleadoVista } from "@contable/shared";
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
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { sucursalesQuery } from "@/modules/organizacion/sucursales/sucursales-api";
import { FormularioEmpleado } from "./formulario-empleado";
import { empleadosQuery, useEditarEmpleado, type FiltrosEmpleados } from "./empleados-api";
import { TEXTOS_EMPLEADOS as T } from "./textos";

type Formulario = { tipo: "nuevo" } | { tipo: "editar"; empleado: EmpleadoVista } | null;

export function PantallaEmpleados({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeEditar = usePermiso("planilla.calcular");
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState<FiltrosEmpleados>({ estado: "todos" });
  const [formulario, setFormulario] = useState<Formulario>(null);
  const empleados = useQuery(empleadosQuery(empresaId, filtros));
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const editar = useEditarEmpleado(empresaId);

  const lista = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es");
    return (empleados.data ?? []).filter(
      (e) =>
        !texto ||
        [e.nombres, e.apellidos, e.dui, e.nit, e.puesto, e.area ?? ""].some((valor) =>
          valor.toLocaleLowerCase("es").includes(texto),
        ),
    );
  }, [empleados.data, busqueda]);

  function cambiarEstado(empleado: EmpleadoVista, activo: boolean) {
    editar.mutate(
      { id: empleado.id, cambios: { activo } },
      {
        onSuccess: () => toast.success(activo ? T.activado(empleado.dui) : T.inactivado(empleado.dui)),
        onError: (error) => toast.error(mensajeDeError(error)),
      },
    );
  }

  return (
    <Pagina className="max-w-[1240px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeEditar && (
          <Button className="h-11 rounded-full px-5" onClick={() => setFormulario({ tipo: "nuevo" })}>
            <Plus aria-hidden="true" />
            {T.nuevo}
          </Button>
        )}
      </EncabezadoPagina>

      <Card className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr]">
        <Input
          type="search"
          aria-label={T.buscar}
          placeholder={T.buscar}
          className="h-10"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <NativeSelect
          aria-label={T.estado}
          className="h-10"
          value={filtros.estado}
          onChange={(e) => setFiltros({ estado: e.target.value as FiltrosEmpleados["estado"] })}
        >
          <option value="todos">{T.todos}</option>
          <option value="activos">{T.activos}</option>
          <option value="inactivos">{T.inactivos}</option>
        </NativeSelect>
      </Card>

      {empleados.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {empleados.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(empleados.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void empleados.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {empleados.isSuccess && lista.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <IdCard aria-hidden="true" className="size-8" />
          <p>{busqueda || filtros.estado !== "todos" ? T.sinResultados : T.vacio}</p>
        </Card>
      )}
      {empleados.isSuccess && lista.length > 0 && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.empleado}</TableHead>
                <TableHead>{T.columnas.dui}</TableHead>
                <TableHead>{T.columnas.nit}</TableHead>
                <TableHead>{T.columnas.iss}</TableHead>
                <TableHead>{T.columnas.nup}</TableHead>
                <TableHead>{T.columnas.puesto}</TableHead>
                <TableHead>{T.columnas.area}</TableHead>
                <TableHead className="text-right">{T.columnas.salario}</TableHead>
                <TableHead>{T.columnas.ingreso}</TableHead>
                <TableHead>{T.columnas.sucursal}</TableHead>
                <TableHead>{T.columnas.estado}</TableHead>
                {puedeEditar && <TableHead className="text-right">{T.columnas.acciones}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((e) => (
                <TableRow key={e.id} className={cn(!e.activo && "opacity-60")}>
                  <TableCell className="font-medium">{`${e.nombres} ${e.apellidos}`}</TableCell>
                  <TableCell className="font-medium tabular-nums">{e.dui}</TableCell>
                  <TableCell className="tabular-nums">{e.nit}</TableCell>
                  <TableCell className="tabular-nums">{e.numeroIsss}</TableCell>
                  <TableCell className="tabular-nums">{e.nup}</TableCell>
                  <TableCell>{e.puesto}</TableCell>
                  <TableCell>{e.area ?? T.sinArea}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearDinero(e.salario)}</TableCell>
                  <TableCell>{formatearFecha(e.fechaIngreso)}</TableCell>
                  <TableCell>{e.sucursal}</TableCell>
                  <TableCell>
                    <Badge variant={e.activo ? "solida" : "neutra"}>{e.activo ? T.activo : T.inactivo}</Badge>
                  </TableCell>
                  {puedeEditar && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={T.editar(e.dui)}
                        onClick={() => setFormulario({ tipo: "editar", empleado: e })}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={e.activo ? T.inactivar(e.dui) : T.activar(e.dui)}
                        disabled={editar.isPending}
                        onClick={() => cambiarEstado(e, !e.activo)}
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

      <FormularioEmpleado
        empresaId={empresaId}
        empleado={formulario?.tipo === "editar" ? formulario.empleado : undefined}
        sucursales={sucursales.data ?? []}
        cargandoSucursales={sucursales.isPending}
        abierto={formulario !== null}
        onCerrar={() => setFormulario(null)}
      />
    </Pagina>
  );
}
