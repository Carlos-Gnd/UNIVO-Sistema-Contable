import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, MapPin } from "lucide-react";
import type { SucursalDetalle } from "@contable/shared";
import { navegar } from "@/app/navegacion";
import { Alert } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/native-select";
import { mensajeDeError } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { sucursalesQuery } from "@/modules/organizacion/sucursales/sucursales-api";
import { empresasDisponiblesQuery } from "@/modules/organizacion/empresa/empresas-disponibles-api";
import { guardarUltimaSeleccion, leerUltimaSeleccion } from "./ultima-seleccion";

interface SelectorEmpresaSucursalProps {
  empresaId: string;
  ruta: string;
  sucursalId?: string;
  onCambiarSucursal: (sucursalId: string) => void;
}

function sucursalInicial(sucursales: readonly SucursalDetalle[]): string {
  return (
    sucursales.find((sucursal) => sucursal.activa && sucursal.esMatriz)?.id ??
    sucursales.find((sucursal) => sucursal.activa)?.id ??
    ""
  );
}

/** Selector de empresa y sucursal activa del encabezado (S1-T51, HU-09). */
export function SelectorEmpresaSucursal({
  empresaId,
  ruta,
  sucursalId,
  onCambiarSucursal,
}: SelectorEmpresaSucursalProps) {
  const { t } = useTranslation("layout");
  const empresas = useQuery(empresasDisponiblesQuery());
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const [sucursalElegida, setSucursalElegida] = useState("");
  const sucursalesActivas = useMemo(
    () => (sucursales.data ?? []).filter((sucursal) => sucursal.activa),
    [sucursales.data],
  );
  const [ultimaSeleccion, setUltimaSeleccion] = useState(leerUltimaSeleccion);
  const sucursalActual =
    sucursalesActivas.find((sucursal) => sucursal.id === sucursalId)?.id ??
    sucursalesActivas.find((sucursal) => sucursal.id === sucursalElegida)?.id ??
    (ultimaSeleccion?.empresaId === empresaId
      ? sucursalesActivas.find((sucursal) => sucursal.id === ultimaSeleccion.sucursalId)?.id
      : undefined) ??
    sucursalInicial(sucursalesActivas);

  useEffect(() => {
    if (!empresaId || !sucursalActual) return;
    guardarUltimaSeleccion({ empresaId, sucursalId: sucursalActual });
    if (sucursalActual !== sucursalId) onCambiarSucursal(sucursalActual);
  }, [empresaId, sucursalActual, sucursalId, onCambiarSucursal]);

  function cambiarEmpresa(nuevaEmpresaId: string) {
    if (!nuevaEmpresaId || nuevaEmpresaId === empresaId) return;
    const seleccion = { empresaId: nuevaEmpresaId, sucursalId: null };
    setUltimaSeleccion(seleccion);
    guardarUltimaSeleccion(seleccion);
    const partes = ruta.split("/").filter(Boolean);
    const subruta = partes.slice(2).join("/");
    const destino = `/empresas/${encodeURIComponent(nuevaEmpresaId)}${subruta ? `/${subruta}` : ""}`;
    navegar(destino);
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <Building2 aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
      <NativeSelect
        aria-label={t("selector.empresa")}
        className="max-w-40 text-xs sm:max-w-52"
        value={empresaId}
        disabled={empresas.isPending || empresas.isError || empresas.data?.length === 0}
        onChange={(evento) => cambiarEmpresa(evento.currentTarget.value)}
      >
        {empresas.isPending && <option value={empresaId}>{t("selector.cargandoEmpresas")}</option>}
        {empresas.isError && <option value={empresaId}>{t("selector.errorEmpresas")}</option>}
        {empresas.data?.length === 0 && <option value={empresaId}>{t("selector.sinEmpresas")}</option>}
        {empresas.data?.map((empresa) => (
          <option key={empresa.id} value={empresa.id}>
            {empresa.esDemostracion ? `${empresa.nombre} (${t("selector.demostracion")})` : empresa.nombre}
          </option>
        ))}
      </NativeSelect>

      <MapPin aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
      <NativeSelect
        aria-label={t("selector.sucursal")}
        className="max-w-36 text-xs sm:max-w-48"
        value={sucursalActual}
        disabled={sucursales.isPending || sucursales.isError || sucursalesActivas.length === 0}
        onChange={(evento) => {
          const id = evento.currentTarget.value;
          setSucursalElegida(id);
          const seleccion = { empresaId, sucursalId: id };
          setUltimaSeleccion(seleccion);
          guardarUltimaSeleccion(seleccion);
          onCambiarSucursal(id);
        }}
      >
        {sucursales.isPending && <option value="">{t("selector.cargandoSucursales")}</option>}
        {sucursales.isError && <option value="">{t("selector.errorSucursales")}</option>}
        {sucursalesActivas.length === 0 && !sucursales.isPending && !sucursales.isError && (
          <option value="">{t("selector.sinSucursales")}</option>
        )}
        {sucursalesActivas.map((sucursal) => (
          <option key={sucursal.id} value={sucursal.id}>
            {sucursal.nombre}
          </option>
        ))}
      </NativeSelect>

      {(empresas.isError || sucursales.isError) && (
        <Alert variant="error" className="sr-only" role="alert">
          {empresas.isError ? `${t("selector.errorEmpresas")}: ${mensajeDeError(empresas.error)}` : null}
          {sucursales.isError
            ? `${t("selector.errorSucursales")}: ${mensajeDeError(sucursales.error)}`
            : null}
        </Alert>
      )}
    </div>
  );
}
