import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, LoaderCircle, Send } from "lucide-react";
import { Dinero } from "@contable/shared";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import {
  DialogoGenerar,
  EstadoDeclaracion,
  FilaResumen,
} from "@/modules/tributario/pago-a-cuenta/pantalla-pago-a-cuenta";
import {
  liquidacionIvaQuery,
  useGenerarPartidaLiquidacionIva,
  usePresentarLiquidacionIva,
} from "./liquidacion-iva-api";
import { TEXTOS_LIQUIDACION_IVA as T } from "./textos";

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

/** Nombre del mes que sigue a uno dado, con su año si cambia. */
function mesSiguiente(anio: number, mes: number): string {
  return mes === 12 ? `enero de ${anio + 1}` : `${MESES[mes] ?? ""} de ${anio}`;
}

/** Contenido de la pestaña F-07: liquidación del IVA del mes con su partida de liquidación (HU-48). */
export function ContenidoLiquidacionIva({ empresaId, periodo }: { empresaId: string; periodo: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const puedeGenerar = usePermiso("declaraciones.generar");

  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const periodoValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100 && mes >= 1 && mes <= 12;
  const consulta = useQuery({
    ...liquidacionIvaQuery(empresaId, anio, mes),
    enabled: Boolean(empresaId) && periodoValido,
  });
  const generar = useGenerarPartidaLiquidacionIva(empresaId);
  const presentar = usePresentarLiquidacionIva(empresaId);
  const vista = consulta.data;
  const declaracion = vista?.declaracion ?? null;

  const sinPartidaVigente = !declaracion || declaracion.estadoPartida === "anulada";
  const hayDebito = vista ? !Dinero.de(vista.debitoFiscal).esCero() : false;
  const puedeGenerarMes =
    puedeGenerar && Boolean(vista) && sinPartidaVigente && hayDebito && Boolean(vista?.periodoAbierto);
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
    <>
      {!empresaId && <Alert variant="error">{T.sinEmpresa}</Alert>}
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
          {!hayDebito && sinPartidaVigente && <Alert>{T.avisos.sinDebito}</Alert>}
          {!vista.periodoAbierto && sinPartidaVigente && hayDebito && (
            <Alert variant="error">{T.avisos.periodoCerrado}</Alert>
          )}
          {declaracion?.estadoPartida === "borrador" && <Alert>{T.avisos.borradorPendiente}</Alert>}
          {declaracion?.estadoPartida === "anulada" && !declaracion.presentadaEn && (
            <Alert>{T.avisos.anuladaPendiente}</Alert>
          )}
          {hayDebito && !Dinero.de(vista.remanenteTotal).esCero() && (
            <Alert>
              {T.avisos.saldoAFavor(
                formatearDinero(vista.remanenteTotal),
                mesSiguiente(vista.anio, vista.mes),
              )}
            </Alert>
          )}
          {hayDebito &&
            Dinero.de(vista.remanenteTotal).esCero() &&
            !Dinero.de(vista.ivaPorPagar).esCero() && (
              <Alert>{T.avisos.porPagar(formatearDinero(vista.ivaPorPagar))}</Alert>
            )}

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {T.pestana}, {MESES[vista.mes - 1]} {vista.anio}
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
                <FilaResumen
                  etiqueta={T.filas.debitoContribuyentes}
                  monto={vista.debitoContribuyentes}
                  secundaria
                />
                <FilaResumen
                  etiqueta={T.filas.debitoConsumidor}
                  monto={vista.debitoConsumidorFinal}
                  secundaria
                />
                <FilaResumen etiqueta={T.filas.debito} monto={vista.debitoFiscal} fuerte />
                <FilaResumen etiqueta={T.filas.credito} monto={vista.creditoFiscal} />
                <FilaResumen etiqueta={T.filas.percibido} monto={vista.percibidoSufrido} secundaria />
                <FilaResumen etiqueta={T.filas.retenido} monto={vista.retenidoSufrido} secundaria />
                <FilaResumen
                  etiqueta={T.filas.remanenteAnterior}
                  monto={vista.remanenteAnteriorTotal}
                  secundaria
                />
                <FilaResumen etiqueta={T.filas.porPagar} monto={vista.ivaPorPagar} fuerte />
                <FilaResumen etiqueta={T.filas.remanente} monto={vista.remanenteTotal} />
                <FilaResumen
                  etiqueta={T.filas.percibidoEfectuado}
                  monto={vista.percibidoEfectuado}
                  secundaria
                />
                <FilaResumen
                  etiqueta={T.filas.retenidoEfectuado}
                  monto={vista.retenidoEfectuado}
                  secundaria
                />
                <FilaResumen etiqueta={T.filas.totalAEnterar} monto={vista.totalAEnterar} fuerte />
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
              <EstadoDeclaracion declaracion={declaracion} />
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
            titulo={T.confirmacion.titulo}
            abierto={confirmando}
            generando={generar.isPending}
            onCerrar={() => setConfirmando(false)}
            onConfirmar={confirmarGenerar}
          />
        </>
      )}
    </>
  );
}
