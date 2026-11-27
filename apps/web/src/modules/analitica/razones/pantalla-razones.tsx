import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Dinero } from "@contable/shared";
import { toast } from "sonner";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { usePermisos, usePermiso } from "@/modules/organizacion/permisos";
import { balanceGeneralQuery } from "@/modules/reportes/balance-general/balance-general-api";
import { estadoResultadosQuery } from "@/modules/reportes/estados/estados-api";
import { Pestanas } from "@/modules/reportes/comun/pestanas";
import { calcularActividadInventario } from "./actividad";
import { descargarRazonesExcel, filasRazones, type FilaRazon } from "./exportar-razones";
import { PanelProyecciones } from "./panel-proyecciones";
import { razonesFinancierasQuery } from "./razones-api";
import { TEXTOS_RAZONES as T } from "./textos";
import "./razones.css";

function mesActual(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

function rangoMes(mes: string): { desde: string; hasta: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null;
  const [anioTexto, mesTexto] = mes.split("-");
  const anio = Number(anioTexto);
  const numeroMes = Number(mesTexto);
  const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  return {
    desde: `${anioTexto}-${mesTexto}-01`,
    hasta: `${anioTexto}-${mesTexto}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

function fechaSaldoInicial(desde: string): string {
  const fecha = new Date(`${desde}T00:00:00.000Z`);
  if (fecha.getUTCMonth() === 0 && fecha.getUTCDate() === 1) return desde;
  fecha.setUTCDate(fecha.getUTCDate() - 1);
  return fecha.toISOString().slice(0, 10);
}

function CeldaRazon({ fila }: { fila: FilaRazon }) {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3 align-middle">
        <p className="font-semibold">{fila.nombre}</p>
        <p className="mt-1 text-xs text-muted-foreground">{fila.formula}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{fila.valor}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{fila.interpretacion}</td>
    </tr>
  );
}

function TablaGrupo({ titulo, filas }: { titulo: string; filas: readonly FilaRazon[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={titulo} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">
                {T.razon}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {T.valor}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {T.interpretacion}
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <CeldaRazon key={fila.nombre} fila={fila} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MenuExportar({ onExcel, deshabilitado }: { onExcel: () => void; deshabilitado: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative print:hidden">
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-full px-5"
        disabled={deshabilitado}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((estado) => !estado)}
      >
        <Download aria-hidden="true" />
        {T.exportar}
      </Button>
      {abierto && (
        <div
          role="menu"
          aria-label={T.exportar}
          className="absolute right-0 z-10 mt-2 min-w-40 rounded-xl border bg-popover p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              setAbierto(false);
              window.print();
            }}
          >
            <FileText aria-hidden="true" className="size-4" />
            {T.pdf}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              setAbierto(false);
              onExcel();
            }}
          >
            <FileSpreadsheet aria-hidden="true" className="size-4" />
            {T.excel}
          </button>
        </div>
      )}
    </div>
  );
}

export function PantallaRazones({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const proyeccionesHabilitadas = import.meta.env.VITE_PROYECCIONES_HABILITADAS === "true";
  const puedeVer = usePermiso("estados.ver");
  const puedeVerAnalitica = usePermiso("analitica.ver");
  const mostrarProyecciones = proyeccionesHabilitadas && puedeVerAnalitica;
  const permisos = usePermisos();
  const [mes, setMes] = useState(mesActual);
  const [sucursalId, setSucursalId] = useState("");
  const [pestana, setPestana] = useState<"razones" | "proyecciones">("razones");
  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const disponibles = useMemo(
    () =>
      (sucursales.data ?? []).filter(
        (sucursal) =>
          sucursal.activa && (permisos.todasSucursales || permisos.sucursales.includes(sucursal.id)),
      ),
    [permisos.sucursales, permisos.todasSucursales, sucursales.data],
  );
  const sucursalElegida = disponibles.some((sucursal) => sucursal.id === sucursalId) ? sucursalId : "";
  const periodo = rangoMes(mes);
  const razones = useQuery({
    ...razonesFinancierasQuery(empresaId, {
      ...(periodo ?? { desde: "", hasta: "" }),
      sucursalId: sucursalElegida,
    }),
    enabled: puedeVer && Boolean(periodo),
  });
  const balance = useQuery({
    ...balanceGeneralQuery(empresaId, {
      fecha: periodo?.hasta ?? "",
      sucursalId: sucursalElegida,
      formato: "",
    }),
    enabled: puedeVer && Boolean(periodo),
  });
  const balanceInicial = useQuery({
    ...balanceGeneralQuery(empresaId, {
      fecha: periodo ? fechaSaldoInicial(periodo.desde) : "",
      sucursalId: sucursalElegida,
      formato: "",
    }),
    enabled: puedeVer && Boolean(periodo),
  });
  const estado = useQuery({
    ...estadoResultadosQuery(empresaId, {
      ...(periodo ?? { desde: "", hasta: "" }),
      sucursalId: sucursalElegida,
      formato: "",
    }),
    enabled: puedeVer && Boolean(periodo),
  });
  const capitalTrabajo = balance.data
    ? formatearDinero(Dinero.de(balance.data.activoCorriente.total).menos(balance.data.pasivoCorriente.total))
    : null;
  const actividad =
    estado.data && balanceInicial.data && balance.data
      ? calcularActividadInventario(estado.data, balanceInicial.data, balance.data)
      : { rotacion: null, dias: null };
  const filas = razones.data ? filasRazones(razones.data, capitalTrabajo, actividad) : [];
  const grupos = [
    { titulo: T.liquidez, filas: filas.filter((fila) => fila.grupo === T.liquidez) },
    { titulo: T.endeudamiento, filas: filas.filter((fila) => fila.grupo === T.endeudamiento) },
    { titulo: T.rentabilidad, filas: filas.filter((fila) => fila.grupo === T.rentabilidad) },
    { titulo: T.actividad, filas: filas.filter((fila) => fila.grupo === T.actividad) },
  ];
  const sucursalNombre =
    disponibles.find((sucursal) => sucursal.id === sucursalElegida)?.nombre ?? T.consolidado;
  const exportarExcel = async () => {
    if (razones.data && capitalTrabajo !== null) {
      try {
        await descargarRazonesExcel(razones.data, empresaId, capitalTrabajo, actividad);
      } catch (error) {
        toast.error(`${T.exportacionError} ${mensajeDeError(error)}`);
      }
    }
  };

  return (
    <Pagina className="pantalla-razones max-w-[1100px] print:max-w-none print:gap-3 print:px-0 print:pt-0">
      <EncabezadoPagina
        titulo={mostrarProyecciones ? T.titulo : T.tituloRazones}
        descripcion={mostrarProyecciones ? T.descripcion : T.descripcionRazones}
      >
        {pestana === "razones" && (
          <MenuExportar
            onExcel={exportarExcel}
            deshabilitado={!razones.data || !balance.data || !balanceInicial.data || !estado.data}
          />
        )}
      </EncabezadoPagina>
      {!puedeVer ? (
        <Alert>{T.sinPermiso}</Alert>
      ) : (
        <>
          {mostrarProyecciones && (
            <Pestanas
              etiqueta={T.pestanas}
              valor={pestana}
              opciones={[
                { valor: "razones", texto: T.pestanaRazones },
                { valor: "proyecciones", texto: T.pestanaProyecciones },
              ]}
              onCambio={setPestana}
              idPanel="panel-analitica"
            />
          )}
          <div
            id="panel-analitica"
            role={mostrarProyecciones ? "tabpanel" : undefined}
            aria-labelledby={mostrarProyecciones ? `pestana-${pestana}` : undefined}
          >
            {mostrarProyecciones && pestana === "proyecciones" ? (
              <PanelProyecciones empresaId={empresaId} />
            ) : (
              <>
                <Card className="filtros-razones grid gap-4 p-4 sm:grid-cols-2 print:hidden">
                  <Field>
                    <FieldLabel htmlFor="razones-mes">{T.mes}</FieldLabel>
                    <Input
                      id="razones-mes"
                      type="month"
                      value={mes}
                      onChange={(evento) => setMes(evento.target.value)}
                      className="h-10"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="razones-sucursal">{T.sucursal}</FieldLabel>
                    <NativeSelect
                      id="razones-sucursal"
                      value={sucursalElegida}
                      disabled={sucursales.isPending}
                      onChange={(evento) => setSucursalId(evento.target.value)}
                      className="h-10"
                    >
                      <option value="">{T.consolidado}</option>
                      {disponibles.map((sucursal) => (
                        <option key={sucursal.id} value={sucursal.id}>
                          {sucursal.nombre}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </Card>
                {!periodo && <Alert variant="error">{T.mesInvalido}</Alert>}
                {periodo &&
                  (razones.isPending ||
                    balance.isPending ||
                    balanceInicial.isPending ||
                    estado.isPending) && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {T.cargando}
                    </p>
                  )}
                {(razones.isError || balance.isError || balanceInicial.isError || estado.isError) && (
                  <Alert variant="error">
                    <p>
                      {T.error}{" "}
                      {mensajeDeError(razones.error ?? balance.error ?? balanceInicial.error ?? estado.error)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        void Promise.all([
                          razones.refetch(),
                          balance.refetch(),
                          balanceInicial.refetch(),
                          estado.refetch(),
                        ])
                      }
                    >
                      {T.reintentar}
                    </Button>
                  </Alert>
                )}
                {sucursales.isError && <Alert variant="error">{mensajeDeError(sucursales.error)}</Alert>}
                {razones.data &&
                  balance.data &&
                  balanceInicial.data &&
                  estado.data &&
                  !razones.isError &&
                  !balance.isError &&
                  !balanceInicial.isError &&
                  !estado.isError && (
                    <>
                      <p className="text-sm text-muted-foreground print:hidden">
                        {T.fechaAl(formatearFecha(razones.data.hasta))} · {sucursalNombre}
                      </p>
                      <div className="grid gap-3">
                        {grupos.map((grupo) => (
                          <TablaGrupo key={grupo.titulo} titulo={grupo.titulo} filas={grupo.filas} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground print:hidden">
                        Los valores se calculan con los estados financieros del período seleccionado.
                      </p>
                    </>
                  )}
                {razones.isSuccess &&
                  balance.isSuccess &&
                  balanceInicial.isSuccess &&
                  estado.isSuccess &&
                  filas.every((fila) => fila.valor === T.sinDato) && <Alert>{T.vacio}</Alert>}
              </>
            )}
          </div>
        </>
      )}
    </Pagina>
  );
}
