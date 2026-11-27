import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dinero } from "@contable/shared";
import { Download, FileText } from "lucide-react";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { usePermisos, usePermiso } from "@/modules/organizacion/permisos";
import { TEXTOS_TABLERO as T } from "./textos";
import { tableroQuery, type TableroIndicadores } from "./tablero-api";
import "./tablero.css";

const monto = (valor: string) => formatearDinero(valor, { simbolo: false });
const mesActual = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
};

function porcentajeGeometrico(valor: string, maximo: string): number {
  const tope = Dinero.de(maximo).abs();
  if (tope.esCero()) return 0;
  const proporcion = Dinero.de(valor).abs().dividido(tope.aTexto()).por(100).aTexto();
  return Math.max(0, Math.min(100, Number(proporcion)));
}

function BarraKpi({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{monto(valor)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
    </Card>
  );
}

function GraficaVentasSemanales({ datos }: { datos: TableroIndicadores["ventasSemanales"] }) {
  const maximo = datos.reduce((mayor, semana) => {
    const total = Dinero.de(semana.comprobantesCreditoFiscal).mas(semana.consumidorFinal);
    return total.mayorQue(mayor) ? total : mayor;
  }, Dinero.cero());
  const escala = maximo.esCero() ? "1.00" : maximo.aTexto();

  return (
    <svg
      className="h-64 w-full overflow-visible"
      viewBox="0 0 600 260"
      role="img"
      aria-label={T.ventasSemanales}
    >
      {[0, 1, 2, 3, 4].map((linea) => {
        const y = 20 + linea * 48;
        return (
          <line key={linea} x1="42" x2="590" y1={y} y2={y} stroke="currentColor" className="text-border" />
        );
      })}
      {datos.map((semana, indice) => {
        const paso = 500 / Math.max(datos.length, 1);
        const ancho = Math.min(42, paso * 0.62);
        const x = 52 + indice * paso + (paso - ancho) / 2;
        const credito = porcentajeGeometrico(semana.comprobantesCreditoFiscal, escala) * 1.72;
        const final = porcentajeGeometrico(semana.consumidorFinal, escala) * 1.72;
        const base = 212;
        return (
          <g key={semana.etiqueta}>
            <rect
              x={x}
              y={base - credito}
              width={ancho}
              height={credito}
              rx="2"
              fill="var(--primary)"
              aria-label={`${T.creditoFiscal}: ${monto(semana.comprobantesCreditoFiscal)}`}
            >
              <title>{`${T.creditoFiscal}: ${monto(semana.comprobantesCreditoFiscal)}`}</title>
            </rect>
            <rect
              x={x}
              y={base - credito - final}
              width={ancho}
              height={final}
              rx="2"
              fill="var(--muted-foreground)"
              aria-label={`${T.consumidorFinal}: ${monto(semana.consumidorFinal)}`}
            >
              <title>{`${T.consumidorFinal}: ${monto(semana.consumidorFinal)}`}</title>
            </rect>
            <text x={x + ancho / 2} y="234" textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {semana.etiqueta}
            </text>
          </g>
        );
      })}
      {datos.length === 0 && (
        <text x="300" y="125" textAnchor="middle" className="fill-muted-foreground text-sm">
          {T.sinDatos}
        </text>
      )}
      <text x="4" y="216" className="fill-muted-foreground text-[10px]">
        0
      </text>
    </svg>
  );
}

function GraficaPuente({ datos }: { datos: TableroIndicadores["etapasUtilidad"] }) {
  const maximo = datos.reduce((mayor, etapa) => {
    const actual = Dinero.de(etapa.monto).abs();
    return actual.mayorQue(mayor) ? actual : mayor;
  }, Dinero.cero());
  const escala = maximo.esCero() ? "1.00" : maximo.aTexto();

  return (
    <div className="grid gap-3 p-4">
      {datos.map((etapa) => (
        <div key={etapa.id}>
          <div className="flex justify-between gap-3 text-xs">
            <span className="truncate">{etapa.concepto}</span>
            <span className="shrink-0 text-right font-semibold tabular-nums">{monto(etapa.monto)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${porcentajeGeometrico(etapa.monto, escala)}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="w-12 text-right text-[10px] text-muted-foreground tabular-nums">
              {T.porcentaje(etapa.porcentajeVentas)}
            </span>
          </div>
        </div>
      ))}
      {datos.length === 0 && <p className="text-sm text-muted-foreground">{T.sinDatos}</p>}
    </div>
  );
}

function GraficaProductos({ datos }: { datos: TableroIndicadores["productosRentables"] }) {
  const ordenados = [...datos]
    .sort((a, b) => {
      const utilidadA = Dinero.de(a.utilidadBruta);
      const utilidadB = Dinero.de(b.utilidadBruta);
      if (utilidadA.mayorQue(utilidadB)) return -1;
      if (utilidadB.mayorQue(utilidadA)) return 1;
      return 0;
    })
    .slice(0, 8);
  const maximo = ordenados.reduce((mayor, producto) => {
    const actual = Dinero.de(producto.utilidadBruta).abs();
    return actual.mayorQue(mayor) ? actual : mayor;
  }, Dinero.cero());
  const escala = maximo.esCero() ? "1.00" : maximo.aTexto();

  return (
    <div className="grid gap-2 p-4">
      {ordenados.map((producto) => (
        <div
          key={producto.id}
          className="grid grid-cols-[minmax(0,1fr)_minmax(60px,42%)_auto] items-center gap-3 text-xs"
        >
          <span className="truncate">{producto.nombre}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${porcentajeGeometrico(producto.utilidadBruta, escala)}%` }}
              aria-hidden="true"
            />
          </div>
          <span className="text-right font-semibold tabular-nums">{monto(producto.utilidadBruta)}</span>
        </div>
      ))}
      {ordenados.length === 0 && <p className="text-sm text-muted-foreground">{T.sinDatos}</p>}
    </div>
  );
}

function GraficaCategorias({ datos }: { datos: TableroIndicadores["categorias"] }) {
  const maximo = datos.reduce((mayor, categoria) => {
    const ventas = Dinero.de(categoria.ventasNetas).abs();
    const utilidad = Dinero.de(categoria.utilidadBruta).abs();
    const total = ventas.mayorQue(utilidad) ? ventas : utilidad;
    return total.mayorQue(mayor) ? total : mayor;
  }, Dinero.cero());
  const escala = maximo.esCero() ? "1.00" : maximo.aTexto();

  return (
    <svg
      className="h-64 w-full"
      viewBox="0 0 520 260"
      role="img"
      aria-label={T.categorias}
      preserveAspectRatio="xMidYMid meet"
    >
      {[0, 1, 2, 3].map((linea) => {
        const y = 30 + linea * 55;
        return (
          <line key={linea} x1="30" x2="510" y1={y} y2={y} stroke="currentColor" className="text-border" />
        );
      })}
      {datos.map((categoria, indice) => {
        const paso = 480 / Math.max(datos.length, 1);
        const anchoBarra = Math.min(30, Math.max(8, (paso - 6) / 2));
        const espacio = Math.min(6, paso * 0.08);
        const anchoGrupo = anchoBarra * 2 + espacio;
        const x = 30 + indice * paso + paso / 2 - anchoGrupo / 2;
        const ventas = porcentajeGeometrico(categoria.ventasNetas, escala) * 1.65;
        const utilidad = porcentajeGeometrico(categoria.utilidadBruta, escala) * 1.65;
        return (
          <g key={categoria.id}>
            <rect x={x} y={205 - ventas} width={anchoBarra} height={ventas} rx="2" fill="var(--primary)">
              <title>{`${T.ventas}: ${monto(categoria.ventasNetas)}`}</title>
            </rect>
            <rect
              x={x + anchoBarra + espacio}
              y={205 - utilidad}
              width={anchoBarra}
              height={utilidad}
              rx="2"
              fill="var(--muted-foreground)"
            >
              <title>{`${T.utilidad}: ${monto(categoria.utilidadBruta)}`}</title>
            </rect>
            <text
              x={x + anchoGrupo / 2}
              y="228"
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {categoria.nombre}
              <title>{categoria.nombre}</title>
            </text>
          </g>
        );
      })}
      {datos.length === 0 && (
        <text x="260" y="130" textAnchor="middle" className="fill-muted-foreground text-sm">
          {T.sinDatos}
        </text>
      )}
    </svg>
  );
}

function MenuExportar() {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="tablero-acciones relative print:hidden">
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-full px-5"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
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
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted"
            onClick={() => {
              setAbierto(false);
              window.print();
            }}
          >
            <FileText aria-hidden="true" className="size-4" />
            {T.pdf}
          </button>
        </div>
      )}
    </div>
  );
}

export function PantallaTablero({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("analitica.ver");
  const permisos = usePermisos();
  const [mes, setMes] = useState(mesActual);
  const [sucursalId, setSucursalId] = useState("");
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
  const mesValido = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  const indicadores = useQuery({
    ...tableroQuery(empresaId, { mes, sucursalId: sucursalElegida }),
    enabled: puedeVer && mesValido,
  });
  const data = indicadores.data;
  const alcance =
    disponibles.find((sucursal) => sucursal.id === sucursalElegida)?.nombre ?? T.todasSucursales;

  return (
    <Pagina className="pantalla-tablero-impresion max-w-[1120px] print:max-w-none print:gap-3 print:px-0 print:pt-0">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        <MenuExportar />
      </EncabezadoPagina>

      {!puedeVer ? (
        <Alert>{T.sinPermiso}</Alert>
      ) : (
        <>
          <Card className="tablero-filtros grid gap-4 p-4 sm:grid-cols-2 print:hidden">
            <Field>
              <FieldLabel htmlFor="tablero-mes">{T.mes}</FieldLabel>
              <Input
                id="tablero-mes"
                type="month"
                value={mes}
                onChange={(evento) => setMes(evento.target.value)}
                className="h-10"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tablero-sucursal">{T.sucursal}</FieldLabel>
              <NativeSelect
                id="tablero-sucursal"
                value={sucursalElegida}
                disabled={sucursales.isPending}
                onChange={(evento) => setSucursalId(evento.target.value)}
                className="h-10"
              >
                <option value="">{T.todasSucursales}</option>
                {disponibles.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id}>
                    {sucursal.nombre}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </Card>

          {!mesValido && <Alert variant="error">{T.mesInvalido}</Alert>}
          {mesValido && indicadores.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              {T.cargando}
            </p>
          )}
          {indicadores.isError && (
            <Alert variant="error">
              <p>
                {T.error} {mensajeDeError(indicadores.error)}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void indicadores.refetch()}>
                {T.reintentar}
              </Button>
            </Alert>
          )}
          {sucursales.isError && <Alert variant="error">{mensajeDeError(sucursales.error)}</Alert>}

          {data && !indicadores.isError && (
            <>
              <p className="sr-only">{alcance}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
                <BarraKpi etiqueta={T.ventasNetas} valor={data.ventasNetas} detalle={`US$ · ${mes}`} />
                <BarraKpi
                  etiqueta={T.utilidadBruta}
                  valor={data.utilidadBruta}
                  detalle={T.margenBruto(data.margenBruto)}
                />
                <BarraKpi
                  etiqueta={T.utilidadEjercicio}
                  valor={data.utilidadEjercicio}
                  detalle={T.margenNeto(data.margenNeto)}
                />
                <BarraKpi etiqueta={T.efectivo} valor={data.efectivo} detalle={T.caja} />
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr] print:grid-cols-2">
                <Card className="overflow-hidden">
                  <CardHeader title={T.ventasSemanales} description={T.ventasSemanalesDetalle} />
                  <div className="p-4">
                    <GraficaVentasSemanales datos={data.ventasSemanales} />
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <i className="size-2 rounded-sm bg-primary" />
                        {T.creditoFiscal}
                      </span>
                      <span className="flex items-center gap-2">
                        <i className="size-2 rounded-sm bg-muted-foreground" />
                        {T.consumidorFinal}
                      </span>
                    </div>
                  </div>
                </Card>
                <Card className="overflow-hidden">
                  <CardHeader title={T.ventaAUtilidad} description={T.ventaAUtilidadDetalle} />
                  <GraficaPuente datos={data.etapasUtilidad} />
                </Card>
                <Card className="overflow-hidden">
                  <CardHeader title={T.productosRentables} description={T.utilidadEnDolares} />
                  <GraficaProductos datos={data.productosRentables} />
                </Card>
                <Card className="overflow-hidden">
                  <CardHeader title={T.ventasPorCategoria} description={T.categoriasDetalle} />
                  <div className="px-4 pt-2">
                    <GraficaCategorias datos={data.categorias} />
                    <div className="flex flex-wrap gap-4 pb-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <i className="size-2 rounded-sm bg-primary" />
                        {T.ventas}
                      </span>
                      <span className="flex items-center gap-2">
                        <i className="size-2 rounded-sm bg-muted-foreground" />
                        {T.utilidad}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
              <p className="text-xs text-muted-foreground print:hidden">
                {alcance} · {mes}
              </p>
            </>
          )}
        </>
      )}
    </Pagina>
  );
}
