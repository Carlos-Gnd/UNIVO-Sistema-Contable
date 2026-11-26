import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { NOMBRES_ESTADOS, type SeccionEstado } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso, usePermisos } from "@/modules/organizacion/permisos";
import { EncabezadoReporte } from "../comun/encabezado-reporte";
import { ExportarEstado } from "../exportacion/exportar-estado";
import { useAnexoNotas } from "../notas/anexo-notas";
import { IndicadorCuadre } from "../comun/indicador-cuadre";
import { SelectorFormato } from "../comun/selector-formato";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { balanceGeneralQuery, type FiltrosBalance } from "./balance-general-api";
import { documentoBalanceGeneral } from "./documento-balance-general";
import { TEXTOS_BALANCE as T } from "./textos";

/**
 * Balance general a una fecha (S2-T47, HU-38), de una sucursal o consolidado: activo corriente y no corriente
 * frente a pasivo y patrimonio. Indica si cuadra y, si no, la diferencia.
 */
export function PantallaBalanceGeneral({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("estados.ver");
  const permisos = usePermisos();
  const [filtros, setFiltros] = useState<FiltrosBalance>(() => ({
    fecha: hoyIso(),
    sucursalId: "",
    formato: "",
  }));

  const sucursales = useQuery({ ...sucursalesQuery(empresaId), enabled: puedeVer });
  const empresa = useQuery({ ...empresaQuery(empresaId), enabled: puedeVer });
  const disponibles = (sucursales.data ?? []).filter(
    (s) => permisos.todasSucursales || permisos.sucursales.includes(s.id),
  );
  const errorFecha = filtros.fecha ? undefined : T.fechaRequerida;
  const balance = useQuery({ ...balanceGeneralQuery(empresaId, filtros), enabled: puedeVer && !errorFecha });

  // Las notas se llenan con las cifras del mes de la fecha del balance
  const anexo = useAnexoNotas(
    empresaId,
    { desde: `${filtros.fecha.slice(0, 7)}-01`, hasta: filtros.fecha, sucursalId: filtros.sucursalId },
    puedeVer && !errorFecha,
  );
  const sucursal = sucursales.data?.find((s) => s.id === filtros.sucursalId);
  const d = balance.data;
  const N = NOMBRES_ESTADOS[d?.formato ?? "clase"].balance;

  return (
    <Pagina className="max-w-[1200px]">
      <EncabezadoPagina titulo={N.titulo} descripcion={T.descripcion}>
        {d && empresa.data && (
          <ExportarEstado
            documento={documentoBalanceGeneral(d)}
            empresa={empresa.data}
            alcance={sucursal?.nombre ?? R.consolidado}
            anexo={anexo}
          />
        )}
      </EncabezadoPagina>

      {!puedeVer ? (
        <Alert>{R.sinPermiso}</Alert>
      ) : (
        <>
          <Card className="p-4">
            <h2 className="sr-only">{R.filtros.titulo}</h2>
            <div className="flex flex-wrap items-start gap-3">
              <Field className="w-[160px]" data-invalid={Boolean(errorFecha)}>
                <FieldLabel htmlFor="balance-fecha">{T.fecha}</FieldLabel>
                <Input
                  id="balance-fecha"
                  type="date"
                  className="h-10 tabular-nums"
                  value={filtros.fecha}
                  aria-invalid={Boolean(errorFecha)}
                  aria-describedby={errorFecha ? "balance-fecha-error" : undefined}
                  onChange={(e) => setFiltros((f) => ({ ...f, fecha: e.target.value }))}
                />
              </Field>
              <Field className="w-full sm:w-[240px]">
                <FieldLabel htmlFor="balance-sucursal">{R.filtros.sucursal}</FieldLabel>
                <NativeSelect
                  id="balance-sucursal"
                  className="h-10"
                  value={filtros.sucursalId}
                  onChange={(e) => setFiltros((f) => ({ ...f, sucursalId: e.target.value }))}
                >
                  <option value="">{R.filtros.consolidado}</option>
                  {disponibles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <SelectorFormato
                id="balance-formato"
                valor={filtros.formato}
                actual={d?.formato}
                onCambio={(formato) => setFiltros((f) => ({ ...f, formato }))}
              />
            </div>
            {errorFecha && (
              <FieldError id="balance-fecha-error" className="mt-2">
                {errorFecha}
              </FieldError>
            )}
          </Card>

          {balance.isFetching && !d && (
            <p role="status" className="text-muted-foreground">
              {R.cargando}
            </p>
          )}
          {balance.isError && (
            <Alert variant="error">
              <p>
                {R.error} {mensajeDeError(balance.error)}
              </p>
              {!(balance.error instanceof ErrorApi && balance.error.estado === 403) && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void balance.refetch()}>
                  {R.reintentar}
                </Button>
              )}
            </Alert>
          )}

          {d && !balance.isError && (
            <>
              <IndicadorCuadre
                cuadra={d.cuadra}
                etiqueta={T.cuadre}
                diferencias={[{ etiqueta: T.cuadre, monto: formatearDinero(d.diferencia) }]}
              />
              <Card className={cn("overflow-hidden", balance.isFetching && "opacity-60")}>
                <EncabezadoReporte
                  empresaId={empresaId}
                  titulo={N.titulo}
                  periodo={T.alFecha(formatearFecha(d.fecha))}
                  alcance={sucursal?.nombre ?? R.consolidado}
                />
                <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-border">
                  <Columna titulo={N.activo}>
                    <Seccion seccion={d.activoCorriente} />
                    <Seccion seccion={d.activoNoCorriente} />
                    <Total etiqueta={N.totalActivo} monto={d.totalActivo} />
                  </Columna>
                  <Columna titulo={N.pasivoPatrimonio}>
                    <Seccion seccion={d.pasivoCorriente} />
                    <Seccion seccion={d.pasivoNoCorriente} />
                    <Subtotal etiqueta={N.totalPasivo} monto={d.totalPasivo} />
                    <Seccion seccion={d.patrimonio} />
                    <Total etiqueta={N.totalPasivoPatrimonio} monto={d.totalPasivoPatrimonio} />
                  </Columna>
                </div>
              </Card>
            </>
          )}
          <p className="text-xs text-muted-foreground">{R.nota}</p>
        </>
      )}
    </Pagina>
  );
}

function Columna({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      aria-label={titulo}
      className="flex flex-col gap-4 border-b border-border p-5 last:border-0 lg:border-0"
    >
      <h3 className="text-xs font-bold tracking-[.08em] text-muted-foreground uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

const monto = (valor: string) => formatearDinero(valor, { simbolo: false });

/** Una sección (activo corriente, pasivo no corriente…) con sus cuentas de mayor y su total. */
function Seccion({ seccion }: { seccion: SeccionEstado }) {
  return (
    <div role="group" aria-label={seccion.titulo}>
      <h4 className="mb-1 font-semibold">{seccion.titulo}</h4>
      <dl className="grid text-sm">
        {seccion.renglones.length === 0 && <div className="py-1 text-muted-foreground">{T.sinCuentas}</div>}
        {seccion.renglones.map((r) => (
          <div key={`${r.codigo}-${r.nombre}`} className="flex justify-between gap-4 py-1">
            <dt>
              {r.codigo ? (
                <span className="mr-2 text-muted-foreground tabular-nums">{r.codigo}</span>
              ) : (
                <span className="mr-2 text-xs text-muted-foreground italic">{T.calculado}</span>
              )}
              {r.nombre}
            </dt>
            <dd className="tabular-nums">{monto(r.monto)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-border pt-1 font-semibold">
          <dt>{seccion.titulo}</dt>
          <dd className="tabular-nums">{monto(seccion.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Subtotal({ etiqueta, monto: valor }: { etiqueta: string; monto: string }) {
  return (
    <p className="flex justify-between gap-4 font-semibold">
      <span>{etiqueta}</span>
      <span className="tabular-nums">{monto(valor)}</span>
    </p>
  );
}

function Total({ etiqueta, monto: valor }: { etiqueta: string; monto: string }) {
  return (
    <p className="mt-auto flex justify-between gap-4 border-t-2 border-b-4 border-double border-foreground py-2 font-bold">
      <span>{etiqueta}</span>
      <span className="tabular-nums">{formatearDinero(valor)}</span>
    </p>
  );
}
