import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileUp } from "lucide-react";
import { type ConciliacionBancariaVista, type ResultadoImportacionEstadoCuenta } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Campo } from "@/components/campo";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { imprimirDocumento } from "@/modules/reportes/imprimir-documento";
import { escaparHtml } from "@/modules/reportes/html";
import { cuentasTesoreriaQuery } from "../cuentas/cuentas-tesoreria-api";
import {
  conciliacionBancariaQuery,
  useCrearConciliacionBancaria,
  useImportarEstadoCuenta,
  useMarcarConciliacion,
  useValidarEstadoCuenta,
} from "./movimientos-bancarios-api";
import { TEXTOS_CAJA_CHICA as T } from "./textos";

function htmlConciliacion(datos: ConciliacionBancariaVista): string {
  const filas = datos.lineas
    .map(
      (linea) => `
    <tr><td>${escaparHtml(formatearFecha(linea.fecha))}</td><td>${escaparHtml(linea.referencia ?? "")}</td>
    <td>${escaparHtml(linea.concepto)}</td><td>${escaparHtml(formatearDinero(linea.debe))}</td>
    <td>${escaparHtml(formatearDinero(linea.haber))}</td><td>${linea.conciliado ? "Sí" : "No"}</td></tr>`,
    )
    .join("");
  const filasEstadoCuenta = datos.lineasEstadoCuenta
    .map(
      (fila) => `
    <tr><td>${fila.numeroFila}</td><td>${escaparHtml(fila.fecha ? formatearFecha(fila.fecha) : "")}</td>
    <td>${escaparHtml(fila.referencia)}</td><td>${escaparHtml(fila.descripcion)}</td>
    <td>${escaparHtml(fila.monto ? formatearDinero(fila.monto) : "")}</td>
    <td>${escaparHtml(T.conciliacion.importacion.estado[fila.estado])}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Conciliación bancaria</title><style>
    body{font:12px Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}th{background:#f2f2f2}.resumen{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    </style></head><body><h1>Conciliación bancaria</h1><p>${escaparHtml(datos.cuentaBancaria)} · Corte al ${escaparHtml(formatearFecha(datos.fechaCorte))}</p>
    <div class="resumen"><p>Saldo según estado de cuenta: ${escaparHtml(formatearDinero(datos.saldoEstado))}</p>
    <p>Depósitos en tránsito: ${escaparHtml(formatearDinero(datos.depositosEnTransito))}</p>
    <p>Cheques en circulación: ${escaparHtml(formatearDinero(datos.chequesEnCirculacion))}</p>
    <p>Saldo en libros: ${escaparHtml(formatearDinero(datos.saldoLibros))}</p>
    <p>Diferencia: ${escaparHtml(formatearDinero(datos.diferencia))}</p></div>
    <table><thead><tr><th>Fecha</th><th>Referencia</th><th>Concepto</th><th>Debe</th><th>Haber</th><th>Banco</th></tr></thead><tbody>${filas}</tbody></table>
    ${filasEstadoCuenta ? `<h2>Estado de cuenta importado</h2><table><thead><tr><th>Fila</th><th>Fecha</th><th>Referencia</th><th>Descripción</th><th>Monto</th><th>Resultado</th></tr></thead><tbody>${filasEstadoCuenta}</tbody></table>` : ""}</body></html>`;
}

export function PantallaConciliacionBancaria({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("tesoreria.ver");
  const puedeConciliar = usePermiso("tesoreria.conciliar");
  const [cuentaId, setCuentaId] = useState("");
  const [fechaCorte, setFechaCorte] = useState(hoyIso());
  const [saldoEstado, setSaldoEstado] = useState("");
  const [conciliacionId, setConciliacionId] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [resultadoCsv, setResultadoCsv] = useState<ResultadoImportacionEstadoCuenta[] | null>(null);
  const cuentas = useQuery({ ...cuentasTesoreriaQuery(empresaId), enabled: puedeVer });
  const bancos = useMemo(
    () => (cuentas.data ?? []).filter((cuenta) => cuenta.tipo === "banco" && cuenta.activa),
    [cuentas.data],
  );
  const cuentaElegida = cuentaId || bancos[0]?.id || "";
  const crear = useCrearConciliacionBancaria(empresaId);
  const conciliacion = useQuery({ ...conciliacionBancariaQuery(empresaId, conciliacionId) });
  const marcar = useMarcarConciliacion(empresaId, conciliacionId);
  const validarCsv = useValidarEstadoCuenta(empresaId, conciliacionId);
  const importarCsv = useImportarEstadoCuenta(empresaId, conciliacionId);

  async function consultar() {
    crear.mutate(
      { cuentaTesoreriaId: cuentaElegida, fechaCorte, saldoEstado },
      { onSuccess: (datos) => setConciliacionId(datos.id) },
    );
  }

  async function validarArchivo() {
    if (!archivo) return;
    validarCsv.mutate(archivo, { onSuccess: setResultadoCsv });
  }

  function importarArchivo() {
    if (!archivo) return;
    importarCsv.mutate(archivo, {
      onSuccess: (resultado) => {
        setResultadoCsv(resultado);
        void conciliacion.refetch();
      },
    });
  }

  function cambiarMarca(partidaDetalleId: string, conciliado: boolean) {
    marcar.mutate({ partidaDetalleId, conciliado });
  }

  const datos = conciliacion.data;

  return (
    <section className="grid gap-5" aria-labelledby="titulo-conciliacion-bancaria">
      <div>
        <h2 id="titulo-conciliacion-bancaria" className="text-xl font-semibold">
          {T.conciliacion.titulo}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compara los movimientos del libro con el estado de cuenta del banco.
        </p>
      </div>
      {!puedeVer ? (
        <Alert>Tu rol no permite consultar conciliaciones bancarias en esta empresa.</Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <Campo id="conciliacion-cuenta" etiqueta={T.conciliacion.cuenta}>
              {(p) => (
                <NativeSelect
                  {...p}
                  className="h-10 min-w-64"
                  value={cuentaElegida}
                  onChange={(evento) => setCuentaId(evento.target.value)}
                >
                  <option value="">{T.conciliacion.cuenta}</option>
                  {bancos.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.nombre}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Campo>
            <Campo id="conciliacion-fecha" etiqueta={T.conciliacion.fecha}>
              {(p) => (
                <Input
                  {...p}
                  className="h-10"
                  type="date"
                  value={fechaCorte}
                  onChange={(evento) => setFechaCorte(evento.target.value)}
                />
              )}
            </Campo>
            <Campo id="conciliacion-saldo-estado" etiqueta={T.conciliacion.saldoEstado}>
              {(p) => (
                <Input
                  {...p}
                  className="h-10 tabular-nums"
                  type="number"
                  min="0"
                  step="0.01"
                  value={saldoEstado}
                  onChange={(evento) => setSaldoEstado(evento.target.value)}
                />
              )}
            </Campo>
            {puedeConciliar && (
              <Button
                onClick={() => void consultar()}
                disabled={!cuentaElegida || !fechaCorte || !saldoEstado || crear.isPending}
              >
                {T.conciliacion.cargar}
              </Button>
            )}
          </div>
          {crear.error && <Alert variant="error">{mensajeDeError(crear.error)}</Alert>}
          {conciliacion.isPending && conciliacionId && (
            <p role="status" className="text-muted-foreground">
              {T.conciliacion.cargando}
            </p>
          )}
          {conciliacion.isError && (
            <Alert variant="error">
              <p>
                {T.conciliacion.error} {mensajeDeError(conciliacion.error)}
              </p>
              {!(conciliacion.error instanceof ErrorApi && conciliacion.error.estado === 403) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void conciliacion.refetch()}
                >
                  {T.conciliacion.reintentar}
                </Button>
              )}
            </Alert>
          )}
          {datos && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant={datos.diferencia === "0.00" ? "solida" : "neutra"}>
                  {datos.diferencia === "0.00" ? T.conciliacion.sinDiferencia : T.conciliacion.conDiferencia}
                </Badge>
                <div className="flex flex-wrap gap-2">
                  {puedeConciliar && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setResultadoCsv(null);
                        setArchivo(null);
                        setDialogoAbierto(true);
                      }}
                    >
                      <FileUp aria-hidden="true" /> {T.conciliacion.importar}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => imprimirDocumento(htmlConciliacion(datos))}>
                    <Download aria-hidden="true" /> {T.conciliacion.exportar}
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
                <Card className="overflow-hidden">
                  {datos.lineas.length === 0 ? (
                    <p className="p-8 text-center text-muted-foreground">{T.conciliacion.sinMovimientos}</p>
                  ) : (
                    <Table className="min-w-[700px]" aria-label="Movimientos del libro para conciliar">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{T.movimientos.columnas.fecha}</TableHead>
                          <TableHead>{T.movimientos.columnas.referencia}</TableHead>
                          <TableHead>{T.movimientos.columnas.concepto}</TableHead>
                          <TableHead className="text-right">Debe</TableHead>
                          <TableHead className="text-right">Haber</TableHead>
                          <TableHead>{T.conciliacion.marcarBanco}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {datos.lineas.map((linea) => (
                          <TableRow key={linea.partidaDetalleId}>
                            <TableCell className="tabular-nums">{formatearFecha(linea.fecha)}</TableCell>
                            <TableCell className="tabular-nums">{linea.referencia ?? ""}</TableCell>
                            <TableCell>{linea.concepto}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatearDinero(linea.debe)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatearDinero(linea.haber)}
                            </TableCell>
                            <TableCell>
                              <label className="flex items-center gap-2">
                                <Checkbox
                                  aria-label={`${T.conciliacion.marcarBanco} ${linea.referencia ?? linea.concepto}`}
                                  checked={linea.conciliado}
                                  disabled={!puedeConciliar || marcar.isPending}
                                  onChange={(evento) =>
                                    cambiarMarca(linea.partidaDetalleId, evento.target.checked)
                                  }
                                />
                                <span className="sr-only">{T.conciliacion.marcarBanco}</span>
                              </label>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
                <Card className="grid content-start gap-3 p-5">
                  <Resumen linea={T.conciliacion.saldoEstado} monto={datos.saldoEstado} />
                  <Resumen linea={`+ ${T.conciliacion.depositos}`} monto={datos.depositosEnTransito} />
                  <Resumen linea={`- ${T.conciliacion.cheques}`} monto={datos.chequesEnCirculacion} />
                  <div className="border-t pt-3">
                    <Resumen linea={T.conciliacion.saldoLibros} monto={datos.saldoLibros} fuerte />
                  </div>
                  <div className="border-t pt-3">
                    <Resumen linea={T.conciliacion.diferencia} monto={datos.diferencia} fuerte />
                  </div>
                  {marcar.error && (
                    <Alert variant="error">
                      {T.conciliacion.guardar} {mensajeDeError(marcar.error)}
                    </Alert>
                  )}
                </Card>
              </div>
              {datos.lineasEstadoCuenta.length > 0 && (
                <div className="grid gap-3">
                  <h3 className="font-semibold">{T.conciliacion.filasEstadoCuenta}</h3>
                  <TablaImportacion filas={datos.lineasEstadoCuenta} />
                </div>
              )}
            </>
          )}
        </>
      )}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{T.conciliacion.importacion.titulo}</DialogTitle>
            <DialogDescription>{T.conciliacion.importacion.descripcion}</DialogDescription>
          </DialogHeader>
          <Campo id="estado-cuenta-csv" etiqueta={T.conciliacion.importacion.archivo}>
            {(p) => (
              <Input
                {...p}
                className="h-10"
                type="file"
                accept=".csv,text/csv"
                onChange={(evento) => {
                  setArchivo(evento.target.files?.[0] ?? null);
                  setResultadoCsv(null);
                }}
              />
            )}
          </Campo>
          {(validarCsv.error || importarCsv.error) && (
            <Alert variant="error">{mensajeDeError(validarCsv.error ?? importarCsv.error)}</Alert>
          )}
          {resultadoCsv && <TablaImportacion filas={resultadoCsv} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogoAbierto(false)}>
              {T.conciliacion.importacion.cerrar}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void validarArchivo()}
              disabled={!archivo || validarCsv.isPending}
            >
              {validarCsv.isPending ? T.conciliacion.guardando : T.conciliacion.importacion.validar}
            </Button>
            <Button
              type="button"
              onClick={importarArchivo}
              disabled={
                !archivo ||
                !resultadoCsv?.some((fila) => fila.estado === "coincide" || fila.estado === "revision") ||
                importarCsv.isPending
              }
            >
              {importarCsv.isPending ? T.conciliacion.guardando : T.conciliacion.importacion.importar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Resumen({ linea, monto, fuerte = false }: { linea: string; monto: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${fuerte ? "font-semibold" : "text-sm"}`}>
      <span>{linea}</span>
      <span className="tabular-nums">{formatearDinero(monto)}</span>
    </div>
  );
}

function TablaImportacion({ filas }: { filas: ResultadoImportacionEstadoCuenta[] }) {
  const textos = T.conciliacion.importacion;
  return (
    <Card className="max-h-[45vh] overflow-auto">
      <Table className="min-w-[760px]" aria-label="Vista previa del estado de cuenta">
        <TableHeader>
          <TableRow>
            <TableHead>{textos.tabla.fila}</TableHead>
            <TableHead>{textos.tabla.fecha}</TableHead>
            <TableHead>{textos.tabla.referencia}</TableHead>
            <TableHead>{textos.tabla.descripcion}</TableHead>
            <TableHead>{textos.tabla.monto}</TableHead>
            <TableHead>{textos.tabla.resultado}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((fila) => (
            <TableRow key={`${fila.numeroFila}-${fila.referencia}`}>
              <TableCell>{fila.numeroFila}</TableCell>
              <TableCell>{fila.fecha ? formatearFecha(fila.fecha) : ""}</TableCell>
              <TableCell>{fila.referencia}</TableCell>
              <TableCell>{fila.descripcion}</TableCell>
              <TableCell className="tabular-nums">{fila.monto ? formatearDinero(fila.monto) : ""}</TableCell>
              <TableCell>
                <Badge variant={fila.estado === "coincide" ? "solida" : "neutra"}>
                  {textos.estado[fila.estado]}
                </Badge>
                {fila.detalle && (
                  <p className="mt-1 max-w-64 text-xs text-muted-foreground">{fila.detalle}</p>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
