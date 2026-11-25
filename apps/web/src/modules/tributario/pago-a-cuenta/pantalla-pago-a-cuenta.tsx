import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, FilePlus2, LoaderCircle, Send } from "lucide-react";
import { Dinero, type PagoACuentaVista } from "@contable/shared";
import { toast } from "sonner";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { pagoACuentaQuery, useGenerarPartidaPagoACuenta, usePresentarPagoACuenta } from "./pago-a-cuenta-api";
import { TEXTOS_PAGO_A_CUENTA as T } from "./textos";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Mes anterior al de hoy, el que normalmente se declara, como AAAA-MM. */
function mesPorDefecto(): string {
  const hoy = hoyIso();
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
}

function FilaResumen({
  etiqueta,
  monto,
  fuerte = false,
  secundaria = false,
}: {
  etiqueta: string;
  monto: string;
  fuerte?: boolean;
  secundaria?: boolean;
}) {
  return (
    <tr className={`border-t border-border ${fuerte ? "bg-muted/50 font-semibold" : ""}`}>
      <th
        scope="row"
        className={`px-4 py-3 text-left ${secundaria ? "pl-8 font-normal text-muted-foreground" : fuerte ? "" : "font-normal"}`}
      >
        {etiqueta}
      </th>
      <td className="px-4 py-3 text-right tabular-nums">{formatearDinero(monto)}</td>
    </tr>
  );
}

function EstadoDeclaracion({ vista }: { vista: PagoACuentaVista }) {
  const declaracion = vista.declaracion;
  if (!declaracion) return <Badge variant="discontinua">{T.estados.sinPartida}</Badge>;
  return (
    <>
      {declaracion.estadoPartida === "borrador" && <Badge variant="neutra">{T.estados.borrador}</Badge>}
      {declaracion.estadoPartida === "contabilizada" && (
        <Badge variant="solida">
          <CircleCheck aria-hidden="true" className="size-3" />
          {T.estados.contabilizada(declaracion.numeroPartida)}
        </Badge>
      )}
      {declaracion.estadoPartida === "anulada" && <Badge variant="tachada">{T.estados.anulada}</Badge>}
      {declaracion.presentadaEn && <Badge variant="contorno">{T.estados.presentada}</Badge>}
    </>
  );
}

function DialogoGenerar({
  vista,
  abierto,
  generando,
  onCerrar,
  onConfirmar,
}: {
  vista: PagoACuentaVista;
  abierto: boolean;
  generando: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  const totalDebe = Dinero.sumar(vista.lineasPartida.map((l) => l.debe)).aTexto();
  const totalHaber = Dinero.sumar(vista.lineasPartida.map((l) => l.haber)).aTexto();
  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{T.confirmacion.titulo}</DialogTitle>
          <DialogDescription>
            {T.confirmacion.descripcion(
              `${MESES[vista.mes - 1]} ${vista.anio}`,
              formatearFecha(vista.fechaPartida),
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {T.confirmacion.cuenta}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {T.confirmacion.debe}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {T.confirmacion.haber}
                </th>
              </tr>
            </thead>
            <tbody>
              {vista.lineasPartida.map((linea) => (
                <tr key={linea.codigo} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="mr-2 font-mono text-muted-foreground">{linea.codigo}</span>
                    {linea.nombre}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatearDinero(linea.debe)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatearDinero(linea.haber)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/50 font-semibold">
              <tr>
                <th scope="row" className="px-3 py-2 text-left">
                  {T.confirmacion.total}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{formatearDinero(totalDebe)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatearDinero(totalHaber)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={generando}>
            {T.confirmacion.cancelar}
          </Button>
          <Button onClick={onConfirmar} disabled={generando}>
            {generando && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {generando ? T.acciones.generando : T.confirmacion.confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PantallaPagoACuenta({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const [periodo, setPeriodo] = useState(mesPorDefecto);
  const [confirmando, setConfirmando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const puedeGenerar = usePermiso("declaraciones.generar");

  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const periodoValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100 && mes >= 1 && mes <= 12;
  const consulta = useQuery({
    ...pagoACuentaQuery(empresaId, anio, mes),
    enabled: Boolean(empresaId) && periodoValido,
  });
  const generar = useGenerarPartidaPagoACuenta(empresaId);
  const presentar = usePresentarPagoACuenta(empresaId);
  const vista = consulta.data;
  const declaracion = vista?.declaracion ?? null;

  const sinPartidaVigente = !declaracion || declaracion.estadoPartida === "anulada";
  const hayIngresos = vista ? !Dinero.de(vista.pagoACuenta).esCero() : false;
  const puedeGenerarMes =
    puedeGenerar && Boolean(vista) && sinPartidaVigente && hayIngresos && Boolean(vista?.periodoAbierto);
  const puedePresentar =
    puedeGenerar && declaracion?.estadoPartida === "contabilizada" && !declaracion.presentadaEn;

  function confirmarGenerar() {
    setErrorAccion(null);
    generar.mutate(
      { anio, mes },
      {
        onSuccess: () => {
          setConfirmando(false);
          toast.success(T.exito.generada);
        },
        onError: (error) => {
          setConfirmando(false);
          setErrorAccion(mensajeDeError(error));
        },
      },
    );
  }

  function marcarPresentada() {
    setErrorAccion(null);
    presentar.mutate(
      { anio, mes },
      {
        onSuccess: () => toast.success(T.exito.presentada),
        onError: (error) => setErrorAccion(mensajeDeError(error)),
      },
    );
  }

  return (
    <Pagina>
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />

      {!empresaId && <Alert variant="error">{T.sinEmpresa}</Alert>}

      <Card className="grid gap-4 p-4 sm:max-w-xs">
        <label className="grid gap-1.5 text-sm font-medium">
          {T.mes}
          <Input
            type="month"
            required
            value={periodo}
            onChange={(evento) => {
              setPeriodo(evento.target.value);
              setErrorAccion(null);
            }}
          />
        </label>
      </Card>

      {consulta.isPending && periodoValido && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {consulta.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {errorAccion && <Alert variant="error">{errorAccion}</Alert>}

      {vista && (
        <>
          {declaracion?.desactualizada && !declaracion.presentadaEn && (
            <Alert variant="error">{T.avisos.desactualizada}</Alert>
          )}
          {!hayIngresos && sinPartidaVigente && <Alert>{T.avisos.sinIngresos}</Alert>}
          {!vista.periodoAbierto && sinPartidaVigente && hayIngresos && (
            <Alert variant="error">{T.avisos.periodoCerrado}</Alert>
          )}
          {declaracion?.estadoPartida === "borrador" && <Alert>{T.avisos.borradorPendiente}</Alert>}
          {declaracion?.estadoPartida === "anulada" && !declaracion.presentadaEn && (
            <Alert>{T.avisos.anuladaPendiente}</Alert>
          )}

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {T.titulo}, {MESES[vista.mes - 1]} {vista.anio}
              </caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {T.columnas.concepto}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    {T.columnas.monto}
                  </th>
                </tr>
              </thead>
              <tbody>
                <FilaResumen etiqueta={T.filas.ingresos} monto={vista.ingresosBrutos} />
                <FilaResumen etiqueta={T.filas.pago(vista.tasa)} monto={vista.pagoACuenta} fuerte />
                <FilaResumen etiqueta={T.filas.planilla} monto={vista.retencionesPlanilla} secundaria />
                <FilaResumen etiqueta={T.filas.servicios} monto={vista.retencionesServicios} secundaria />
                <FilaResumen etiqueta={T.filas.total} monto={vista.totalAEnterar} fuerte />
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
              <EstadoDeclaracion vista={vista} />
              <div className="flex-1" />
              {puedeGenerar && (
                <>
                  <Button variant="outline" disabled={!puedeGenerarMes} onClick={() => setConfirmando(true)}>
                    <FilePlus2 aria-hidden="true" />
                    {T.acciones.generar}
                  </Button>
                  <Button disabled={!puedePresentar || presentar.isPending} onClick={marcarPresentada}>
                    {presentar.isPending ? (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    ) : (
                      <Send aria-hidden="true" />
                    )}
                    {presentar.isPending ? T.acciones.presentando : T.acciones.presentar}
                  </Button>
                </>
              )}
            </div>
          </Card>
          <p className="text-sm text-muted-foreground">{T.nota}</p>

          <DialogoGenerar
            vista={vista}
            abierto={confirmando}
            generando={generar.isPending}
            onCerrar={() => setConfirmando(false)}
            onConfirmar={confirmarGenerar}
          />
        </>
      )}
    </Pagina>
  );
}
