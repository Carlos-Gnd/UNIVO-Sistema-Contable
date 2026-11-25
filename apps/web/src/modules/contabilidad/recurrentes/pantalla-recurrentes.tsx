import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  crearPlantillaRecurrenteSchema,
  generarPartidaRecurrenteSchema,
  type PlantillaRecurrenteVista,
} from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Campo } from "@/components/campo";
import { Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
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
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { usePermiso } from "@/modules/organizacion/permisos";
import {
  partidasDisponiblesQuery,
  recurrentesQuery,
  useCrearPlantillaRecurrente,
  useEditarPlantillaRecurrente,
  useGenerarMesRecurrentes,
  useGenerarPartidaRecurrente,
} from "./recurrentes-api";
import { TEXTOS_RECURRENTES as T } from "./textos";

export function PantallaRecurrentes({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("partidas.ver");
  const puedeRegistrar = usePermiso("partidas.registrar");
  const consulta = useQuery({ ...recurrentesQuery(empresaId), enabled: puedeVer && Boolean(empresaId) });
  const [nueva, setNueva] = useState(false);
  const [generando, setGenerando] = useState<PlantillaRecurrenteVista | null>(null);
  const [generandoMes, setGenerandoMes] = useState(false);
  const editar = useEditarPlantillaRecurrente(empresaId);

  return (
    <Pagina className="max-w-[1070px] gap-6 px-4 pt-10 sm:px-6 sm:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[36px] font-normal tracking-tight sm:text-[42px]">{T.titulo}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{T.descripcion}</p>
        </div>
        {puedeRegistrar && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setGenerandoMes(true)}>
              {T.generarMes}
            </Button>
            <Button onClick={() => setNueva(true)}>
              <Plus aria-hidden="true" />
              {T.nueva}
            </Button>
          </div>
        )}
      </header>
      {!puedeVer && <Alert>{T.sinPermiso}</Alert>}
      {puedeVer && consulta.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {puedeVer && consulta.isError && (
        <Alert variant="error" role="alert">
          <p>
            {T.errorCarga} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {puedeVer && consulta.isSuccess && consulta.data.length === 0 && <Alert>{T.vacio}</Alert>}
      {puedeVer &&
        consulta.isSuccess &&
        consulta.data.map((plantilla) => (
          <Card key={plantilla.id}>
            <CardHeader
              title={plantilla.nombre}
              description={`${T.sucursal}: ${plantilla.sucursalNombre}${plantilla.concepto ? ` · ${plantilla.concepto}` : ""}`}
            >
              {!plantilla.activa && (
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{T.inactiva}</span>
              )}
              {puedeRegistrar && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      editar.mutate(
                        { id: plantilla.id, cambios: { activa: !plantilla.activa } },
                        { onSuccess: () => toast.success(T.actualizada) },
                      )
                    }
                  >
                    {plantilla.activa ? T.inactivar : T.activar}
                  </Button>
                  <Button size="sm" disabled={!plantilla.activa} onClick={() => setGenerando(plantilla)}>
                    {T.generar}
                  </Button>
                </>
              )}
            </CardHeader>
            <div className="grid gap-3 p-5 text-sm">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2 font-normal">{T.cuenta}</th>
                    <th className="pb-2 text-right font-normal">{T.debe}</th>
                    <th className="pb-2 text-right font-normal">{T.haber}</th>
                  </tr>
                </thead>
                <tbody>
                  {plantilla.lineas.map((linea, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2">
                        {linea.cuentaCodigo} {linea.cuentaNombre}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {linea.debe !== "0" && linea.debe !== "0.00" ? formatearDinero(linea.debe) : ""}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {linea.haber !== "0" && linea.haber !== "0.00" ? formatearDinero(linea.haber) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted-foreground">
                {T.ultima}:{" "}
                {plantilla.ultimaGeneracion ? formatearFecha(plantilla.ultimaGeneracion.fecha) : T.ninguna}
              </p>
            </div>
          </Card>
        ))}
      <DialogoNueva empresaId={empresaId} abierto={nueva} onCerrar={() => setNueva(false)} />
      <DialogoGenerar empresaId={empresaId} plantilla={generando} onCerrar={() => setGenerando(null)} />
      <DialogoGenerarMes
        empresaId={empresaId}
        abierto={generandoMes}
        onCerrar={() => setGenerandoMes(false)}
      />
    </Pagina>
  );
}

function DialogoNueva({
  empresaId,
  abierto,
  onCerrar,
}: {
  empresaId: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const [partidaId, setPartidaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const crear = useCrearPlantillaRecurrente(empresaId);
  const partidas = useQuery({
    ...partidasDisponiblesQuery(empresaId),
    enabled: abierto && Boolean(empresaId),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = validarFormulario(crearPlantillaRecurrenteSchema, { partidaId, nombre });
    if (!r.ok) {
      setErrores(r.errores);
      return;
    }
    setErrores({});
    setMensaje(null);
    crear.mutate(r.datos, {
      onSuccess: () => {
        toast.success(T.creada);
        setPartidaId("");
        setNombre("");
        onCerrar();
      },
      onError: (error) => {
        if (error instanceof ErrorApi && error.estado === 400) setErrores(error.errores);
        else setMensaje(mensajeDeError(error));
      },
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{T.nuevaTitulo}</DialogTitle>
            <DialogDescription>{T.nuevaDescripcion}</DialogDescription>
          </DialogHeader>
          {mensaje && <Alert variant="error">{mensaje}</Alert>}
          <Campo id="recurrente-partida" etiqueta={T.partida} error={errores["partidaId"]?.[0]}>
            {(p) => (
              <NativeSelect
                {...p}
                className="h-10"
                value={partidaId}
                onChange={(e) => setPartidaId(e.target.value)}
              >
                <option value="">{T.elegirPartida}</option>
                {(partidas.data ?? []).map((partida) => (
                  <option key={partida.id} value={partida.id}>
                    {`${formatearFecha(partida.fecha)} · ${partida.concepto ?? "Sin concepto"} · ${formatearDinero(partida.total)}`}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Campo>
          {partidas.isSuccess && partidas.data.length === 0 && <Alert>{T.sinPartidas}</Alert>}
          <Campo id="recurrente-nombre" etiqueta={T.nombre} error={errores["nombre"]?.[0]}>
            {(p) => <Input {...p} value={nombre} onChange={(e) => setNombre(e.target.value)} />}
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              {T.cancelar}
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {T.crear}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoGenerar({
  empresaId,
  plantilla,
  onCerrar,
}: {
  empresaId: string;
  plantilla: PlantillaRecurrenteVista | null;
  onCerrar: () => void;
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const generar = useGenerarPartidaRecurrente(empresaId);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!plantilla) return;
    const r = validarFormulario(generarPartidaRecurrenteSchema, { fecha });
    if (!r.ok) {
      setErrores(r.errores);
      return;
    }
    setErrores({});
    setMensaje(null);
    generar.mutate(
      { id: plantilla.id, datos: r.datos },
      {
        onSuccess: () => {
          toast.success(T.generada);
          onCerrar();
        },
        onError: (error) => setMensaje(mensajeDeError(error)),
      },
    );
  }

  return (
    <Dialog open={plantilla !== null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {T.generarTitulo}: {plantilla?.nombre}
            </DialogTitle>
            <DialogDescription>{T.generarDescripcion}</DialogDescription>
          </DialogHeader>
          {mensaje && <Alert variant="error">{mensaje}</Alert>}
          <Campo id="recurrente-fecha" etiqueta={T.fecha} error={errores["fecha"]?.[0]}>
            {(p) => <Input {...p} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              {T.cancelar}
            </Button>
            <Button type="submit" disabled={generar.isPending}>
              {generar.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {T.generar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoGenerarMes({
  empresaId,
  abierto,
  onCerrar,
}: {
  empresaId: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const generar = useGenerarMesRecurrentes(empresaId);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = validarFormulario(generarPartidaRecurrenteSchema, { fecha });
    if (!r.ok) {
      setErrores(r.errores);
      return;
    }
    setErrores({});
    setMensaje(null);
    generar.mutate(r.datos, {
      onSuccess: (resultado) => {
        toast.success(
          `${T.mesGenerado(resultado.generadas.length)} ${resultado.omitidas.length > 0 ? T.mesOmitidas(resultado.omitidas.length) : ""}`.trim(),
        );
        onCerrar();
      },
      onError: (error) => setMensaje(mensajeDeError(error)),
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{T.generarMesTitulo}</DialogTitle>
            <DialogDescription>{T.generarMesDescripcion}</DialogDescription>
          </DialogHeader>
          {mensaje && <Alert variant="error">{mensaje}</Alert>}
          <Campo id="recurrente-mes-fecha" etiqueta={T.fecha} error={errores["fecha"]?.[0]}>
            {(p) => <Input {...p} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              {T.cancelar}
            </Button>
            <Button type="submit" disabled={generar.isPending}>
              {generar.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {T.generarMes}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
