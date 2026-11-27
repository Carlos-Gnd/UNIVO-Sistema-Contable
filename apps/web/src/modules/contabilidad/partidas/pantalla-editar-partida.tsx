import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SucursalDetalle } from "@contable/shared";
import { toast } from "sonner";
import { navegar } from "@/app/navegacion";
import type { Parametros } from "@/app/rutas";
import { Enlace } from "@/components/enlace";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermiso, usePermisos } from "@/modules/organizacion/permisos";
import { FormularioPartida } from "./formulario-partida";
import { prepararCuentas } from "./lineas";
import { clavesPartidas, cuentasQuery, partidaQuery, sucursalesQuery } from "./partidas-api";
import { TEXTOS_PARTIDA as T } from "./textos";
import { valoresDePartida } from "./valores";

const rutaPartida = (empresaId: string, partidaId: string) =>
  `/empresas/${encodeURIComponent(empresaId)}/partidas/${encodeURIComponent(partidaId)}`;

/**
 * Edición de una partida contabilizada de un período abierto (…/partidas/:partidaId/editar) — HU-23, S2-T08.
 * Cada guardado crea una versión nueva; el período cerrado lo rechaza la API y el mensaje se muestra tal cual.
 */
export function PantallaEditarPartida({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const partidaId = parametros.partidaId ?? "";
  const clienteQuery = useQueryClient();
  const permisos = usePermisos();
  const puedeEditar = usePermiso("partidas.editar_contabilizada");

  const cuentas = useQuery(cuentasQuery(empresaId));
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const partida = useQuery(partidaQuery(empresaId, partidaId));

  const cuentasPreparadas = useMemo(() => prepararCuentas(cuentas.data ?? []), [cuentas.data]);
  const sucursalesDisponibles = useMemo(
    () =>
      (sucursales.data ?? []).filter(
        (s: SucursalDetalle) =>
          s.id === partida.data?.sucursalId ||
          (s.activa && (permisos.todasSucursales || permisos.sucursales.includes(s.id))),
      ),
    [sucursales.data, partida.data?.sucursalId, permisos.todasSucursales, permisos.sucursales],
  );

  const cargando = permisos.estado === "cargando" || sucursales.isPending || partida.isPending;
  const errorCarga = sucursales.isError || partida.isError;
  const volver = () => navegar(rutaPartida(empresaId, partidaId));
  const deActivoFijo = partida.data?.origen === "activo_fijo" || partida.data?.origen === "depreciacion";
  const editable = puedeEditar && partida.data?.estado === "contabilizada" && !deActivoFijo;

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={T.edicion.titulo(partida.data?.numero ?? null)}>
        {partida.data && <Badge variant="solida">{T.estadoContabilizada}</Badge>}
      </EncabezadoPagina>

      {cargando && !errorCarga && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}

      {errorCarga && (
        <Alert variant="error">
          <p>{T.errorCarga}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              void sucursales.refetch();
              void partida.refetch();
            }}
          >
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {cuentas.isError && <Alert variant="error">{T.detalle.errorCuentas}</Alert>}

      {!cargando && !errorCarga && partida.data && (
        <>
          {!puedeEditar && <Alert>{T.edicion.sinPermiso}</Alert>}
          {puedeEditar && partida.data.estado !== "contabilizada" && (
            <Alert>{T.edicion.soloContabilizadas}</Alert>
          )}
          {editable && (
            <Alert>
              {T.edicion.aviso} {T.edicion.periodoCerrado}
            </Alert>
          )}
          <FormularioPartida
            key={`${partida.data.id}-${partida.data.actualizadoEn}`}
            empresaId={empresaId}
            partida={partida.data}
            contabilizada
            iniciales={valoresDePartida(partida.data)}
            cuentas={cuentasPreparadas}
            cuentasDisponibles={cuentas.isSuccess}
            sucursales={sucursalesDisponibles}
            soloLectura={!editable}
            onGuardado={(guardada) => {
              clienteQuery.setQueryData(clavesPartidas.una(empresaId, guardada.id), guardada);
              void clienteQuery.invalidateQueries({ queryKey: clavesPartidas.todas(empresaId) });
              toast.success(T.edicion.guardada);
              navegar(rutaPartida(empresaId, guardada.id));
            }}
            onSalir={volver}
          />
          {deActivoFijo && <Alert>{T.edicion.deActivoFijo}</Alert>}
          {!editable && (
            <Enlace href={rutaPartida(empresaId, partidaId)} className="text-sm underline underline-offset-4">
              {T.edicion.volver}
            </Enlace>
          )}
        </>
      )}
    </Pagina>
  );
}
