import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SucursalDetalle } from "@contable/shared";
import { toast } from "sonner";
import { navegar } from "@/app/navegacion";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hoyIso } from "@/lib/formato";
import { usePermiso, usePermisos } from "@/modules/organizacion/permisos";
import { FormularioPartida } from "./formulario-partida";
import { prepararCuentas } from "./lineas";
import { clavesPartidas, cuentasQuery, partidaQuery, sucursalesQuery } from "./partidas-api";
import { TEXTOS_PARTIDA as T } from "./textos";
import type { PartidaVista } from "./tipos";
import { valoresDePartida, type ValoresIniciales } from "./valores";

/** Sucursal propuesta: la única disponible o, si hay varias, la casa matriz. */
function sucursalPorDefecto(sucursales: readonly SucursalDetalle[]): string {
  if (sucursales.length === 1) return sucursales[0]?.id ?? "";
  return sucursales.find((s) => s.esMatriz)?.id ?? "";
}

function EstadoPartida({ partida }: { partida?: PartidaVista }) {
  if (partida?.estado === "contabilizada") return <Badge variant="solida">{T.estadoContabilizada}</Badge>;
  if (partida?.estado === "anulada") return <Badge variant="tachada">{T.estadoAnulada}</Badge>;
  return <Badge variant="discontinua">{T.sinNumero}</Badge>;
}

function titulo(partidaId: string | undefined, partida?: PartidaVista): string {
  if (!partidaId) return T.tituloNueva;
  if (!partida) return T.tituloPartida;
  return partida.numero === null ? T.tituloBorrador : T.tituloNumero(partida.numero);
}

/**
 * Pantalla de registro (…/partidas/nueva) y de edición de un borrador (…/partidas/:partidaId) — HU-20.
 */
export function PantallaPartida({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const partidaId = parametros.partidaId;
  const clienteQuery = useQueryClient();
  const permisos = usePermisos();
  const puedeRegistrar = usePermiso("partidas.registrar");

  const cuentas = useQuery(cuentasQuery(empresaId));
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const partida = useQuery({ ...partidaQuery(empresaId, partidaId ?? ""), enabled: Boolean(partidaId) });

  const cuentasPreparadas = useMemo(() => prepararCuentas(cuentas.data ?? []), [cuentas.data]);
  // Solo las sucursales activas que el rol puede usar; la de un borrador existente se conserva para mostrarla
  const sucursalesDisponibles = useMemo(
    () =>
      (sucursales.data ?? []).filter(
        (s) =>
          s.id === partida.data?.sucursalId ||
          (s.activa && (permisos.todasSucursales || permisos.sucursales.includes(s.id))),
      ),
    [sucursales.data, partida.data?.sucursalId, permisos.todasSucursales, permisos.sucursales],
  );

  const cargando =
    permisos.estado === "cargando" || sucursales.isPending || (Boolean(partidaId) && partida.isPending);
  const errorCarga = sucursales.isError || partida.isError;

  const iniciales = useMemo<ValoresIniciales | null>(() => {
    if (cargando || errorCarga) return null;
    if (partida.data) return valoresDePartida(partida.data);
    return {
      cabecera: {
        fecha: hoyIso(),
        tipo: "operacion",
        sucursalId: sucursalPorDefecto(sucursalesDisponibles),
        documentoTipo: "",
        documentoNumero: "",
        concepto: "",
      },
      filas: [],
    };
  }, [cargando, errorCarga, partida.data, sucursalesDisponibles]);

  const soloLectura = !puedeRegistrar || (partida.data !== undefined && partida.data.estado !== "borrador");

  function alGuardar(guardada: PartidaVista, creada: boolean) {
    clienteQuery.setQueryData(clavesPartidas.una(empresaId, guardada.id), guardada);
    void clienteQuery.invalidateQueries({ queryKey: clavesPartidas.todas(empresaId), exact: true });
    toast.success(T.acciones.guardado);
    if (creada)
      navegar(`/empresas/${encodeURIComponent(empresaId)}/partidas/${guardada.id}`, { reemplazar: true });
  }

  function salir() {
    if (window.history.length > 1) window.history.back();
    else navegar("/");
  }

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={titulo(partidaId, partida.data)}>
        {(!partidaId || partida.data) && <EstadoPartida partida={partida.data} />}
      </EncabezadoPagina>

      {cargando && (
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
              if (partidaId) void partida.refetch();
            }}
          >
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {cuentas.isError && <Alert variant="error">{T.detalle.errorCuentas}</Alert>}

      {iniciales && (
        <>
          {soloLectura && <Alert>{puedeRegistrar ? T.soloLectura : T.sinPermiso}</Alert>}
          <FormularioPartida
            // Al guardar cambia actualizadoEn y el formulario se reinicia con lo que devolvió la API
            key={partida.data ? `${partida.data.id}-${partida.data.actualizadoEn}` : "nueva"}
            empresaId={empresaId}
            partida={partida.data}
            iniciales={iniciales}
            cuentas={cuentasPreparadas}
            cuentasDisponibles={cuentas.isSuccess}
            sucursales={sucursalesDisponibles}
            soloLectura={soloLectura}
            onGuardado={alGuardar}
            onSalir={salir}
          />
        </>
      )}
    </Pagina>
  );
}
