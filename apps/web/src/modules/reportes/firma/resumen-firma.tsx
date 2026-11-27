import { useState } from "react";
import { CircleCheck, Copy, Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { EstadoFirmadoVista } from "@contable/shared";
import { Button } from "@/components/ui/button";
import { mensajeDeError } from "@/lib/api";
import { formatearFirmadoEn, huellaCorta } from "./formato-firma";
import { descargarPdfFirmado } from "./firma-api";
import { TEXTOS_FIRMA } from "./textos";

const T = TEXTOS_FIRMA.resultado;

/**
 * Datos de una firma: código de verificación, huella, firmante y enlace, con los botones para descargar el PDF
 * firmado y copiar el enlace del portal público.
 *
 * TODO(Carlos): el prototipo muestra además el QR de verificación en pantalla. La web no tiene hoy una librería de
 * QR y la API no devuelve la imagen; el QR ya va dibujado en el PDF firmado. Falta definir si se agrega una
 * librería o un endpoint.
 */
export function ResumenFirma({ empresaId, firma }: { empresaId: string; firma: EstadoFirmadoVista }) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState("");

  async function descargar() {
    setError("");
    setDescargando(true);
    try {
      await descargarPdfFirmado(empresaId, firma);
    } catch (e) {
      setError(`${T.errorDescargar} ${mensajeDeError(e)}`);
    } finally {
      setDescargando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(firma.urlVerificacion);
      toast.success(T.copiado);
    } catch {
      toast.error(T.errorCopiar);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleCheck aria-hidden className="size-4 text-primary" />
        {T.titulo}
      </p>
      <dl className="grid gap-2.5 text-sm">
        <Dato etiqueta={T.codigo}>
          <b className="font-mono text-base tracking-wide">{firma.codigoVerificacion}</b>
        </Dato>
        <Dato etiqueta={T.firmante}>
          {firma.firmante} · {firma.cargo}
        </Dato>
        <Dato etiqueta={T.firmadoEn}>{formatearFirmadoEn(firma.firmadoEn)}</Dato>
        <Dato etiqueta={T.huella}>
          <span className="font-mono text-xs" title={firma.huellaDocumento}>
            {huellaCorta(firma.huellaDocumento)}
          </span>
        </Dato>
        <Dato etiqueta={T.enlace}>
          <span className="font-mono text-xs break-all">{firma.urlVerificacion}</span>
        </Dato>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void descargar()} disabled={descargando}>
          {descargando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {descargando ? T.descargando : T.descargar}
        </Button>
        <Button type="button" variant="outline" onClick={() => void copiar()}>
          <Copy aria-hidden />
          {T.copiar}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b pb-2 last:border-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
