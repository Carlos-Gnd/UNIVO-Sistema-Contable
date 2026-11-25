import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Pencil, Plus, Power, Tags, Upload } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import type { ProductoVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearDinero } from "@/lib/formato";
import { mensajeDeError } from "@/lib/api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { DialogoCategorias } from "./dialogo-categorias";
import { DialogoImportacionProductos } from "./dialogo-importacion";
import { TEXTOS_IMPORTACION_PRODUCTOS } from "./textos-importacion";
import { FormularioProducto } from "./formulario-producto";
import { categoriasQuery, productosQuery, useEditarProducto, type FiltrosProductos } from "./productos-api";
import { TEXTOS_PRODUCTOS as T } from "./textos";

type Formulario = { tipo: "nuevo" } | { tipo: "editar"; producto: ProductoVista } | null;

/** Pantalla de productos y categorías del inventario (HU-64, S3-T77). */
export function PantallaProductos({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeRegistrar = usePermiso("inventario.registrar");
  const [filtros, setFiltros] = useState<FiltrosProductos>({
    busqueda: "",
    categoriaId: "",
    estado: "todos",
  });
  const [formulario, setFormulario] = useState<Formulario>(null);
  const [verCategorias, setVerCategorias] = useState(false);
  const [importando, setImportando] = useState(false);
  const productos = useQuery(productosQuery(empresaId, filtros));
  const categorias = useQuery(categoriasQuery(empresaId));
  const editar = useEditarProducto(empresaId);
  const listaCategorias = categorias.data ?? [];
  const hayFiltros = filtros.busqueda !== "" || filtros.categoriaId !== "" || filtros.estado !== "todos";

  function cambiarEstado(producto: ProductoVista, activo: boolean) {
    editar.mutate(
      { id: producto.id, cambios: { activo } },
      {
        onSuccess: () => toast.success(activo ? T.activado(producto.nombre) : T.inactivado(producto.nombre)),
        onError: (error) => toast.error(mensajeDeError(error)),
      },
    );
  }

  return (
    <Pagina className="max-w-[1120px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setVerCategorias(true)}>
          <Tags aria-hidden="true" />
          {T.categorias}
        </Button>
        {puedeRegistrar && (
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setImportando(true)}>
            <Upload aria-hidden="true" />
            {TEXTOS_IMPORTACION_PRODUCTOS.boton}
          </Button>
        )}
        {puedeRegistrar && (
          <Button className="h-11 rounded-full px-5" onClick={() => setFormulario({ tipo: "nuevo" })}>
            <Plus aria-hidden="true" />
            {T.nuevo}
          </Button>
        )}
      </EncabezadoPagina>

      <Card className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Input
          type="search"
          aria-label={T.filtros.busqueda}
          placeholder={T.filtros.busqueda}
          className="h-10"
          value={filtros.busqueda}
          onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
        />
        <NativeSelect
          aria-label={T.filtros.categoria}
          className="h-10"
          value={filtros.categoriaId}
          onChange={(e) => setFiltros((f) => ({ ...f, categoriaId: e.target.value }))}
        >
          <option value="">{T.filtros.todasCategorias}</option>
          {listaCategorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={T.filtros.estado}
          className="h-10"
          value={filtros.estado}
          onChange={(e) =>
            setFiltros((f) => ({ ...f, estado: e.target.value as FiltrosProductos["estado"] }))
          }
        >
          <option value="todos">{T.filtros.todos}</option>
          <option value="activos">{T.filtros.activos}</option>
          <option value="inactivos">{T.filtros.inactivos}</option>
        </NativeSelect>
      </Card>

      {productos.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {productos.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(productos.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void productos.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {productos.isSuccess && productos.data.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <Package aria-hidden="true" className="size-8" />
          <p>{hayFiltros ? T.sinResultados : T.vacio}</p>
        </Card>
      )}

      {productos.isSuccess && productos.data.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.codigo}</TableHead>
                <TableHead>{T.columnas.nombre}</TableHead>
                <TableHead>{T.columnas.categoria}</TableHead>
                <TableHead>{T.columnas.unidad}</TableHead>
                <TableHead>{T.columnas.series}</TableHead>
                <TableHead className="text-right">{T.columnas.precio}</TableHead>
                <TableHead>{T.columnas.estado}</TableHead>
                {puedeRegistrar && <TableHead className="text-right">{T.columnas.acciones}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.data.map((p) => (
                <TableRow key={p.id} className={cn(!p.activo && "opacity-60")}>
                  <TableCell className="font-medium tabular-nums">{p.codigo}</TableCell>
                  <TableCell>{p.nombre}</TableCell>
                  <TableCell>{p.categoria ?? T.sinCategoria}</TableCell>
                  <TableCell>{p.unidadMedida}</TableCell>
                  <TableCell>{p.controlaSeries ? T.si : T.no}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearDinero(p.precioVenta)}</TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? "solida" : "neutra"}>{p.activo ? T.activo : T.inactivo}</Badge>
                  </TableCell>
                  {puedeRegistrar && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={T.editar(p.nombre)}
                        onClick={() => setFormulario({ tipo: "editar", producto: p })}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={p.activo ? T.inactivar(p.nombre) : T.activar(p.nombre)}
                        disabled={editar.isPending}
                        onClick={() => cambiarEstado(p, !p.activo)}
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

      <FormularioProducto
        empresaId={empresaId}
        producto={formulario?.tipo === "editar" ? formulario.producto : undefined}
        categorias={listaCategorias}
        abierto={formulario !== null}
        onCerrar={() => setFormulario(null)}
      />
      <DialogoImportacionProductos
        empresaId={empresaId}
        abierto={importando}
        onCerrar={() => setImportando(false)}
      />
      <DialogoCategorias
        empresaId={empresaId}
        categorias={listaCategorias}
        puedeRegistrar={puedeRegistrar}
        abierto={verCategorias}
        onCerrar={() => setVerCategorias(false)}
      />
    </Pagina>
  );
}
