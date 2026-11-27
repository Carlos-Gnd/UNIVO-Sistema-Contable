import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, ExternalLink, FileDown, FileJson, QrCode, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { DteVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Enlace } from "@/components/enlace";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mensajeDeError } from "@/lib/api";
import { descargarArchivo } from "@/lib/descargas";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { DialogoInvalidarDte } from "./invalidacion";
import { descargarJsonDte, dteQuery, pdfDteQuery, useInvalidarDte } from "./dte-api";
import { TEXTOS_DTE } from "./textos";

const T = TEXTOS_DTE.visor;

/** URL temporal de un Blob para mostrarlo en la página; se libera al cambiar o al salir. */
function useUrlDeBlob(contenido: Blob | undefined): string | null {
  const url = useMemo(() => (contenido ? URL.createObjectURL(contenido) : null), [contenido]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

/**
 * Visor de un DTE (S4-T14, HU-56): la representación gráfica en PDF con su código QR de la consulta pública, la
 * identificación, el sello de recepción y la verificación de la firma. Desde aquí se descargan el PDF y el JSON
 * firmado, y se invalida el documento.
 */
export function VisorDte({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const dteId = parametros.dteId ?? "";
  const dte = useQuery(dteQuery(empresaId, dteId));
  const d = dte.data;
  const volver = `/empresas/${encodeURIComponent(empresaId)}/dte`;

  return (
    <Pagina className="max-w-[1200px]">
      <Enlace
        href={volver}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {T.volver}
      </Enlace>
      {dte.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {dte.isError && (
        <Alert variant="error">
          {T.error} {mensajeDeError(dte.error)}
        </Alert>
      )}
      {d && <Contenido empresaId={empresaId} dte={d} />}
    </Pagina>
  );
}

function Contenido({ empresaId, dte: d }: { empresaId: string; dte: DteVista }) {
  const pdf = useQuery(pdfDteQuery(empresaId, d.id, d.estado));
  const urlPdf = useUrlDeBlob(pdf.data?.contenido);
  const invalidar = useInvalidarDte(empresaId);
  const invalidado = d.estado === "invalidado";

  async function descargarJson() {
    try {
      const { contenido, nombre } = await descargarJsonDte(empresaId, d.id);
      descargarArchivo(contenido, nombre ?? `${d.numeroControl}.json`);
    } catch (e) {
      toast.error(`${T.errorDescarga} ${mensajeDeError(e)}`);
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo={`${TEXTOS_DTE.tipos[d.tipoDte]} ${d.numeroControl}`}
        descripcion={TEXTOS_DTE.ambiente}
      >
        <Button
          variant="outline"
          className="h-11 rounded-full px-5"
          disabled={!pdf.data}
          onClick={() =>
            pdf.data && descargarArchivo(pdf.data.contenido, pdf.data.nombre ?? `${d.numeroControl}.pdf`)
          }
        >
          <FileDown aria-hidden="true" />
          {T.descargarPdf}
        </Button>
        <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => void descargarJson()}>
          <FileJson aria-hidden="true" />
          {T.descargarJson}
        </Button>
        {!invalidado && (
          <DialogoInvalidarDte
            documento={{
              id: d.id,
              tipo: `${d.tipoDte} · ${TEXTOS_DTE.tipos[d.tipoDte]}`,
              numeroControl: d.numeroControl,
              receptor: d.receptor ?? TEXTOS_DTE.consumidorFinal,
              fecha: d.fechaEmision,
              total: d.total,
            }}
            onInvalidar={async ({ motivo }) => {
              await invalidar.mutateAsync({ dteId: d.id, motivo });
            }}
          />
        )}
      </EncabezadoPagina>

      {invalidado && d.invalidacion && (
        <Alert variant="error">
          <p className="font-semibold">
            {T.invalidado(formatearFecha(d.invalidacion.invalidadoEn.slice(0, 10)))}
          </p>
          <p>
            {T.motivoInvalidacion}: {d.invalidacion.motivo}
          </p>
          <p className="font-mono text-xs break-all">
            {T.selloInvalidacion}: {d.invalidacion.selloRecepcion}
          </p>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">{T.representacion}</h2>
          {pdf.isPending && (
            <p role="status" className="p-10 text-center text-muted-foreground">
              {T.cargandoPdf}
            </p>
          )}
          {pdf.isError && (
            <Alert variant="error" className="m-4">
              {T.errorPdf} {mensajeDeError(pdf.error)}
            </Alert>
          )}
          {urlPdf && (
            <iframe
              title={T.marcoPdf(d.numeroControl)}
              src={urlPdf}
              className="h-[78vh] min-h-[560px] w-full bg-white"
            />
          )}
        </Card>

        <div className="grid content-start gap-4">
          <Card className="grid gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={invalidado ? "neutra" : "solida"}>{TEXTOS_DTE.estados[d.estado]}</Badge>
              {d.firmaValida ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <BadgeCheck aria-hidden="true" className="size-4" />
                  {T.firmaValida}
                </span>
              ) : (
                <span role="alert" className="inline-flex items-center gap-1 text-xs text-destructive">
                  <ShieldAlert aria-hidden="true" className="size-4" />
                  {T.firmaInvalida}
                </span>
              )}
            </div>
            <h2 className="text-sm font-semibold">{T.identificacion}</h2>
            <dl className="grid gap-2 text-sm">
              <Dato etiqueta={T.tipo} valor={`${d.tipoDte} · ${TEXTOS_DTE.tipos[d.tipoDte]}`} />
              <Dato etiqueta={T.numeroControl} valor={d.numeroControl} mono />
              <Dato etiqueta={T.codigoGeneracion} valor={d.codigoGeneracion} mono />
              <Dato etiqueta={T.fechaHora} valor={`${formatearFecha(d.fechaEmision)} ${d.horaEmision}`} />
              <Dato etiqueta={T.receptor} valor={d.receptor ?? TEXTOS_DTE.consumidorFinal} />
              {d.relacionado && <Dato etiqueta={T.relacionado} valor={d.relacionado.numeroControl} mono />}
              <Dato etiqueta={T.iva} valor={formatearDinero(d.iva)} />
              <Dato etiqueta={T.total} valor={formatearDinero(d.total)} fuerte />
              <Dato etiqueta={T.sello} valor={d.selloRecepcion} mono />
            </dl>
          </Card>

          <Card className="grid gap-3 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <QrCode aria-hidden="true" className="size-4" />
              {T.qr}
            </h2>
            <p className="text-sm text-muted-foreground">{T.qrAyuda}</p>
            <a
              href={d.enlaceConsulta}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              {T.abrirConsulta}
            </a>
            <p className="font-mono text-xs break-all text-muted-foreground">{d.enlaceConsulta}</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Dato({
  etiqueta,
  valor,
  mono,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  fuerte?: boolean;
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd
        className={
          mono ? "font-mono text-xs break-all" : fuerte ? "font-semibold tabular-nums" : "tabular-nums"
        }
      >
        {valor}
      </dd>
    </div>
  );
}
