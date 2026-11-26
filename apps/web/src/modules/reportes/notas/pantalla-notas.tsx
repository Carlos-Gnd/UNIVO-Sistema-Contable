import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LARGO_MAXIMO_NOTA, type ClaveNota, type NotaEstado } from "@contable/shared";
import { cn } from "cn";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { sucursalesQuery } from "@/modules/contabilidad/partidas/partidas-api";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { FiltrosDeReporte } from "../comun/filtros-reporte";
import { errorDeFiltros, mesDe, type FiltrosReporte } from "../comun/periodo";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { ExportarEstado } from "../exportacion/exportar-estado";
import { documentoNotas } from "./documento-notas";
import { notasQuery, useGuardarNota, versionesNotaQuery } from "./notas-api";
import { TEXTOS_NOTAS as T } from "./textos";

const monto = (valor: string) => formatearDinero(valor, { simbolo: false });

/** Historial de versiones de la nota abierta, con un botón para volver a usar el texto de una anterior. */
function Versiones({
  empresaId,
  clave,
  fecha,
  alElegir,
  puedeEditar,
}: {
  empresaId: string;
  clave: ClaveNota;
  fecha: string;
  alElegir: (texto: string) => void;
  puedeEditar: boolean;
}) {
  const versiones = useQuery(versionesNotaQuery(empresaId, clave, fecha));
  return (
    <details className="rounded-2xl border border-border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">{T.versiones}</summary>
      {versiones.data?.length === 0 && <p className="mt-2 text-muted-foreground">{T.sinVersiones}</p>}
      <ul className="mt-2 grid gap-2">
        {versiones.data?.map((v) => (
          <li key={v.version} className="grid gap-1 rounded-xl bg-secondary/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {T.versionDe(v.version, formatearFecha(v.creadoEn), v.autor)}
              </span>
              {puedeEditar && (
                <Button variant="outline" size="sm" onClick={() => alElegir(v.texto)}>
                  {T.usarVersion}
                </Button>
              )}
            </div>
            <p className="whitespace-pre-line">{v.texto}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Cifras y tabla que el sistema llena en una nota. */
function CifrasDeNota({ nota }: { nota: NotaEstado }) {
  return (
    <>
      <div>
        <h3 className="text-sm font-semibold">{T.datos}</h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          {nota.campos.map((c) => (
            <div key={c.nombre} className="rounded-2xl bg-secondary/40 p-3">
              <dt className="text-xs text-muted-foreground">{c.nombre}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {c.tipo === "dinero" ? monto(c.valor) : c.valor}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {nota.tabla && (
        <Table aria-label={T.tabla}>
          <TableHeader>
            <TableRow>
              <TableHead>{T.concepto}</TableHead>
              {nota.tabla.columnas.map((c) => (
                <TableHead key={c} className="text-right">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {nota.tabla.renglones.map((r) => (
              <TableRow key={r.concepto} className={cn(r.total && "font-semibold")}>
                <TableCell>{r.concepto}</TableCell>
                {r.valores.map((v, i) => (
                  <TableCell key={nota.tabla?.columnas[i]} className="text-right tabular-nums">
                    {monto(v)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

/**
 * Notas a los estados financieros (S3-T32, HU-44): la lista de notas, el texto editable de cada una con las
 * cifras que llena el sistema, y su historial de versiones. Se exportan juntas, o como anexo de los estados.
 */
export function PantallaNotas({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("estados.ver");
  const puedeEditar = usePermiso("estados.firmar");
  const [filtros, setFiltros] = useState<FiltrosReporte>(() => ({ ...mesDe(), sucursalId: "" }));
  const [actual, setActual] = useState<ClaveNota>("entidad");
  const [borradores, setBorradores] = useState<Partial<Record<ClaveNota, string>>>({});

  const sucursales = useQuery(sucursalesQuery(empresaId));
  const empresa = useQuery(empresaQuery(empresaId));
  const errorFiltros = errorDeFiltros(filtros);
  const consulta = useQuery({
    ...notasQuery(empresaId, filtros),
    enabled: puedeVer && !errorFiltros,
  });
  const guardar = useGuardarNota(empresaId);

  const d = consulta.data;
  const nota = d?.notas.find((n) => n.clave === actual) ?? d?.notas[0];
  const alcance = sucursales.data?.find((s) => s.id === filtros.sucursalId)?.nombre ?? R.consolidado;

  const texto = nota ? (borradores[nota.clave] ?? nota.texto) : "";
  const sinGuardar = nota ? texto !== nota.texto : false;

  async function guardarNota() {
    if (!nota || !d) return;
    if (!texto.trim()) {
      toast.error(T.textoVacio);
      return;
    }
    try {
      const r = await guardar.mutateAsync({ clave: nota.clave, fecha: d.desde, texto });
      toast.success(T.guardada(nota.titulo, r.version));
    } catch (error) {
      toast.error(`${T.errorGuardar} ${mensajeDeError(error)}`);
    }
  }

  return (
    <Pagina className="max-w-[1100px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      {!puedeVer ? (
        <Alert>{R.sinPermiso}</Alert>
      ) : (
        <div className="grid gap-4">
          <FiltrosDeReporte
            valor={filtros}
            onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
            sucursales={sucursales.data ?? []}
            acciones={
              d && empresa.data ? (
                <ExportarEstado documento={documentoNotas(d)} empresa={empresa.data} alcance={alcance} />
              ) : undefined
            }
          />

          {consulta.isFetching && !d && (
            <p role="status" className="text-muted-foreground">
              {R.cargando}
            </p>
          )}
          {consulta.isError && (
            <Alert variant="error">
              <p>
                {R.error} {mensajeDeError(consulta.error)}
              </p>
              {!(consulta.error instanceof ErrorApi && consulta.error.estado === 403) && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
                  {R.reintentar}
                </Button>
              )}
            </Alert>
          )}

          {d && nota && !consulta.isError && (
            <div
              className={cn(
                "grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]",
                consulta.isFetching && "opacity-60",
              )}
            >
              <Card className="overflow-hidden">
                <ul role="listbox" aria-label={T.lista}>
                  {d.notas.map((n) => {
                    const pendiente = borradores[n.clave] !== undefined && borradores[n.clave] !== n.texto;
                    return (
                      <li key={n.clave}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={nota.clave === n.clave}
                          onClick={() => setActual(n.clave)}
                          className={cn(
                            "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0",
                            nota.clave === n.clave
                              ? "bg-primary font-semibold text-primary-foreground"
                              : "hover:bg-secondary/60",
                          )}
                        >
                          <span className="w-5 tabular-nums">{n.numero}</span>
                          <span className="flex-1 truncate">{n.titulo}</span>
                          {(n.editada || pendiente) && (
                            <i
                              className="size-1.5 rounded-full bg-current"
                              title={pendiente ? T.textoSinGuardar : T.textoGuardado(n.version ?? 1)}
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card className="grid gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium">{T.notaNumero(nota.numero, nota.titulo)}</h2>
                    <p className="text-sm text-muted-foreground">
                      {sinGuardar
                        ? T.textoSinGuardar
                        : nota.version !== null
                          ? T.textoGuardado(nota.version)
                          : T.textoSugerido}
                    </p>
                  </div>
                  {puedeEditar && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={texto === nota.textoSugerido}
                      onClick={() => setBorradores((b) => ({ ...b, [nota.clave]: nota.textoSugerido }))}
                    >
                      <RefreshCcw aria-hidden />
                      {T.restaurar}
                    </Button>
                  )}
                </div>

                <Textarea
                  aria-label={T.etiquetaTexto}
                  rows={5}
                  maxLength={LARGO_MAXIMO_NOTA}
                  value={texto}
                  readOnly={!puedeEditar}
                  onChange={(e) => setBorradores((b) => ({ ...b, [nota.clave]: e.target.value }))}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {puedeEditar ? T.caracteres(texto.length, LARGO_MAXIMO_NOTA) : T.soloLectura}
                  </span>
                  {puedeEditar && (
                    <Button disabled={!sinGuardar || guardar.isPending} onClick={() => void guardarNota()}>
                      {guardar.isPending ? T.guardando : T.guardar}
                    </Button>
                  )}
                </div>

                <CifrasDeNota nota={nota} />

                <Versiones
                  empresaId={empresaId}
                  clave={nota.clave}
                  fecha={d.desde}
                  puedeEditar={puedeEditar}
                  alElegir={(t) => setBorradores((b) => ({ ...b, [nota.clave]: t }))}
                />
              </Card>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {d && T.ejercicio(d.ejercicioAnio)} {T.enDolares}. {R.nota}
          </p>
        </div>
      )}
    </Pagina>
  );
}
