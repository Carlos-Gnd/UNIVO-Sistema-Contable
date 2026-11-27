import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, LoaderCircle } from "lucide-react";
import type { EstadoFirmadoVista } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Enlace } from "@/components/enlace";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { descargarPdfFirmado, estadosFirmadosQuery } from "./firma-api";
import { formatearFirmadoEn } from "./formato-firma";
import { ResumenFirma } from "./resumen-firma";
import { TEXTOS_FIRMA } from "./textos";

const T = TEXTOS_FIRMA.lista;

function FilaFirmada({
  empresaId,
  firma,
  alVer,
}: {
  empresaId: string;
  firma: EstadoFirmadoVista;
  alVer: (firma: EstadoFirmadoVista) => void;
}) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState("");

  async function descargar() {
    setError("");
    setDescargando(true);
    try {
      await descargarPdfFirmado(empresaId, firma);
    } catch (e) {
      setError(`${TEXTOS_FIRMA.resultado.errorDescargar} ${mensajeDeError(e)}`);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{firma.titulo}</span>
        <span className="block text-xs text-muted-foreground">{firma.periodo}</span>
      </TableCell>
      <TableCell className="font-mono whitespace-nowrap">{firma.codigoVerificacion}</TableCell>
      <TableCell className="whitespace-nowrap">{formatearFirmadoEn(firma.firmadoEn)}</TableCell>
      <TableCell>
        <span className="block max-w-[190px] truncate">{firma.firmante}</span>
        <span className="block text-xs text-muted-foreground">{firma.cargo}</span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={T.detalle(firma.codigoVerificacion)}
            onClick={() => alVer(firma)}
          >
            <Eye aria-hidden />
            {T.detalleCorto}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={T.descargar(firma.codigoVerificacion)}
            disabled={descargando}
            onClick={() => void descargar()}
          >
            {descargando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            {T.descargaCorta}
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-right text-sm text-destructive">
            {error}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Lista de los estados financieros firmados de la empresa, con su código y su PDF firmado (HU-87, S4-T32). */
export function PantallaEstadosFirmados({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("estados.ver");
  const [detalle, setDetalle] = useState<EstadoFirmadoVista | null>(null);
  const consulta = useQuery({ ...estadosFirmadosQuery(empresaId), enabled: puedeVer });
  const firmas = consulta.data ?? [];

  return (
    <Pagina className="max-w-[1000px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      {!puedeVer ? (
        <Alert>{T.sinPermiso}</Alert>
      ) : consulta.isPending ? (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      ) : consulta.isError ? (
        <Alert variant="error">
          <p>
            {T.error} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      ) : firmas.length === 0 ? (
        <Card className="grid gap-1 p-8 text-center">
          <p className="font-medium">{T.vacia}</p>
          <p className="text-sm text-muted-foreground">{T.vaciaAyuda}</p>
          <Enlace
            href={`/empresas/${encodeURIComponent(empresaId)}/estados`}
            className="mt-2 text-sm font-medium underline"
          >
            {T.irEstados}
          </Enlace>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T.columnas.estado}</TableHead>
                <TableHead>{T.columnas.codigo}</TableHead>
                <TableHead>{T.columnas.firmadoEn}</TableHead>
                <TableHead>{T.columnas.firmante}</TableHead>
                <TableHead className="text-right">{T.columnas.acciones}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {firmas.map((f) => (
                <FilaFirmada key={f.id} empresaId={empresaId} firma={f} alVer={setDetalle} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={detalle !== null} onOpenChange={(abierto) => !abierto && setDetalle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detalle?.titulo ?? T.detalleTitulo}</DialogTitle>
            <DialogDescription>{detalle ? detalle.periodo : T.detalleTitulo}</DialogDescription>
          </DialogHeader>
          {detalle && <ResumenFirma empresaId={empresaId} firma={detalle} />}
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}
