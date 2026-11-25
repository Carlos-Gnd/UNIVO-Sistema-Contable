import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, DatabaseBackup, RotateCcw } from "lucide-react";
import type { CrearRespaldo, RespaldoVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiArchivo, mensajeDeError } from "@/lib/api";
import { formatearFecha } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { sucursalesQuery } from "@/modules/organizacion/sucursales/sucursales-api";
import { useCrearRespaldo, respaldosQuery, useRestaurarRespaldo } from "./respaldos-api";
import { TEXTOS_RESPALDOS as T } from "./textos";

function guardarArchivo(contenido: Blob, nombre: string) {
  const url = URL.createObjectURL(contenido);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

function FilaRespaldo({
  empresaId,
  respaldo,
  puedeRestaurar,
  alRestaurar,
}: {
  empresaId: string;
  respaldo: RespaldoVista;
  puedeRestaurar: boolean;
  alRestaurar: (respaldo: RespaldoVista) => void;
}) {
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState(false);

  async function descargar() {
    setError("");
    setDescargando(true);
    try {
      const archivo = await apiArchivo(
        `/empresas/${encodeURIComponent(empresaId)}/respaldos/${encodeURIComponent(respaldo.id)}/archivo`,
      );
      guardarArchivo(archivo.contenido, archivo.nombre ?? respaldo.nombreArchivo);
    } catch (errorDescarga) {
      setError(`${T.errorDescargar} ${mensajeDeError(errorDescarga)}`);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{respaldo.nombreArchivo}</span>
        <span className="block text-xs text-muted-foreground">
          {respaldo.tipo === "empresa" ? T.tipo.empresa : T.sucursalNombre(respaldo.sucursal)}
        </span>
      </TableCell>
      <TableCell>{formatearFecha(respaldo.creadoEn)}</TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={descargando} onClick={descargar}>
            <Download aria-hidden="true" />
            {descargando ? "Descargando…" : T.descarga(respaldo.nombreArchivo)}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!puedeRestaurar || respaldo.tipo !== "empresa"}
            onClick={() => alRestaurar(respaldo)}
          >
            <RotateCcw aria-hidden="true" />
            {T.restaurar(respaldo.nombreArchivo)}
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-left text-sm text-destructive">
            {error}
          </p>
        )}
        {respaldo.tipo === "sucursal" && (
          <p className="mt-2 text-right text-xs text-muted-foreground">{T.soloCompleto}</p>
        )}
      </TableCell>
    </TableRow>
  );
}

export function PantallaRespaldos({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeCrear = usePermiso("respaldo.crear");
  const puedeRestaurar = usePermiso("respaldo.restaurar");
  const [tipo, setTipo] = useState<"empresa" | "sucursal">("empresa");
  const [sucursalId, setSucursalId] = useState("");
  const [seleccionado, setSeleccionado] = useState<RespaldoVista | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const respaldos = useQuery({ ...respaldosQuery(empresaId), enabled: puedeCrear || puedeRestaurar });
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeCrear && tipo === "sucursal" });
  const crear = useCrearRespaldo(empresaId);
  const restaurar = useRestaurarRespaldo(empresaId);
  const puedeVer = puedeCrear || puedeRestaurar;

  async function crearRespaldo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    const datos: CrearRespaldo = tipo === "sucursal" ? { sucursalId } : {};
    try {
      const respaldo = await crear.mutateAsync(datos);
      const archivo = await apiArchivo(
        `/empresas/${encodeURIComponent(empresaId)}/respaldos/${encodeURIComponent(respaldo.id)}/archivo`,
      );
      guardarArchivo(archivo.contenido, archivo.nombre ?? respaldo.nombreArchivo);
      setMensaje(T.creado);
    } catch (errorCrear) {
      setError(`${T.errorCrear} ${mensajeDeError(errorCrear)}`);
    }
  }

  async function confirmarRestauracion() {
    if (!seleccionado || confirmacion !== "RESTAURAR") return;
    setError("");
    setMensaje("");
    try {
      const resultado = await restaurar.mutateAsync(seleccionado.id);
      setMensaje(T.restaurado(resultado.filasRestauradas));
      setSeleccionado(null);
      setConfirmacion("");
    } catch (errorRestauracion) {
      setError(`${T.errorRestaurar} ${mensajeDeError(errorRestauracion)}`);
    }
  }

  const lista = respaldos.data ?? [];
  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      {!puedeVer && <Alert variant="error">{T.sinPermiso}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {mensaje && <Alert>{mensaje}</Alert>}
      {puedeCrear && (
        <Card className="grid gap-4 p-5">
          <h2 className="font-semibold">{T.alcance}</h2>
          <form className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={crearRespaldo}>
            <label className="grid gap-1.5 text-sm font-medium">
              {T.alcance}
              <NativeSelect
                value={tipo}
                onChange={(evento) => {
                  setTipo(evento.target.value as "empresa" | "sucursal");
                  setSucursalId("");
                }}
              >
                <option value="empresa">{T.empresaCompleta}</option>
                <option value="sucursal">{T.sucursal}</option>
              </NativeSelect>
            </label>
            {tipo === "sucursal" ? (
              <label className="grid gap-1.5 text-sm font-medium">
                {T.sucursal}
                <NativeSelect
                  required
                  value={sucursalId}
                  onChange={(evento) => setSucursalId(evento.target.value)}
                >
                  <option value="">{T.seleccionarSucursal}</option>
                  {(sucursales.data ?? [])
                    .filter((fila) => fila.activa)
                    .map((fila) => (
                      <option key={fila.id} value={fila.id}>
                        {fila.nombre}
                      </option>
                    ))}
                </NativeSelect>
              </label>
            ) : (
              <p className="text-sm text-muted-foreground">{T.empresaCompleta}</p>
            )}
            <Button type="submit" disabled={crear.isPending || (tipo === "sucursal" && !sucursalId)}>
              <DatabaseBackup aria-hidden="true" />
              {crear.isPending ? T.creando : T.crear}
            </Button>
          </form>
        </Card>
      )}

      {seleccionado && (
        <Card role="alertdialog" aria-labelledby="confirmacion-titulo" className="grid gap-4 p-5">
          <div>
            <h2 id="confirmacion-titulo" className="font-semibold">
              {T.confirmacion.titulo}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{T.confirmacion.descripcion}</p>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            {T.confirmacion.instruccion}
            <Input
              aria-label={T.confirmacion.campo}
              value={confirmacion}
              onChange={(evento) => setConfirmacion(evento.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSeleccionado(null);
                setConfirmacion("");
              }}
            >
              {T.confirmacion.cancelar}
            </Button>
            <Button
              type="button"
              disabled={confirmacion !== "RESTAURAR" || restaurar.isPending}
              onClick={() => void confirmarRestauracion()}
            >
              {restaurar.isPending ? T.confirmacion.ejecutando : T.confirmacion.ejecutar}
            </Button>
          </div>
        </Card>
      )}

      <Card className="grid gap-4 p-5">
        <h2 className="font-semibold">{T.lista}</h2>
        {puedeVer && respaldos.isPending && <p role="status">{T.cargando}</p>}
        {respaldos.isError && (
          <Alert variant="error">
            <p>{T.errorCarga}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void respaldos.refetch()}>
              {T.reintentar}
            </Button>
          </Alert>
        )}
        {respaldos.isSuccess && lista.length === 0 && (
          <p className="text-sm text-muted-foreground">{T.vacio}</p>
        )}
        {lista.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.alcance}</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((respaldo) => (
                  <FilaRespaldo
                    key={respaldo.id}
                    empresaId={empresaId}
                    respaldo={respaldo}
                    puedeRestaurar={puedeRestaurar}
                    alRestaurar={(fila) => {
                      setSeleccionado(fila);
                      setConfirmacion("");
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </Pagina>
  );
}
