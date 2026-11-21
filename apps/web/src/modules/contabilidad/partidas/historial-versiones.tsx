import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { cn } from "cn";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { TEXTOS_HISTORIAL as T } from "./textos-historial";
import type { PartidaVista } from "./tipos";
import { armarVersiones, compararLineas, type MarcaLinea, type VersionPartida } from "./versiones";
import { versionesQuery } from "./versiones-api";

const ESTILO_MARCA: Record<MarcaLinea, "solida" | "contorno" | "alerta" | undefined> = {
  igual: undefined,
  nueva: "solida",
  cambio: "contorno",
  quitada: "alerta",
};

function ListaVersiones({
  versiones,
  elegida,
  onElegir,
}: {
  versiones: readonly VersionPartida[];
  elegida: number;
  onElegir: (numero: number) => void;
}) {
  return (
    <ol aria-label={T.titulo} className="grid gap-1 p-3">
      {versiones.map((v) => (
        <li key={v.numero}>
          <button
            type="button"
            aria-current={v.numero === elegida}
            onClick={() => onElegir(v.numero)}
            className={cn(
              "grid w-full gap-1 rounded-2xl border px-3.5 py-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              v.numero === elegida ? "border-input bg-secondary" : "border-transparent hover:bg-secondary",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <b className="font-semibold">{T.version(v.numero)}</b>
              <Badge variant={v.vigente ? "solida" : "neutra"}>{v.vigente ? T.vigente : T.anterior}</Badge>
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatearFecha(v.fecha)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function LineasVersion({
  versiones,
  elegida,
  onVerVigente,
}: {
  versiones: readonly VersionPartida[];
  elegida: VersionPartida;
  onVerVigente: () => void;
}) {
  // La lista va de la más nueva a la más vieja: la anterior a la elegida es la siguiente
  const indice = versiones.indexOf(elegida);
  const previa = versiones[indice + 1];
  const filas = compararLineas(elegida.partida.lineas, previa?.partida.lineas);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h3 className="font-semibold">
            {elegida.vigente ? T.lineasVigente : T.lineasVersion(elegida.numero)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {!elegida.vigente ? T.soloLectura : previa ? T.cambios(previa.numero) : null}
          </p>
        </div>
        {!elegida.vigente && (
          <Button type="button" variant="outline" size="sm" onClick={onVerVigente}>
            {T.verVigente}
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{T.codigo}</TableHead>
            <TableHead>{T.cuenta}</TableHead>
            <TableHead className="text-right">{T.debe}</TableHead>
            <TableHead className="text-right">{T.haber}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => {
            const quitada = f.marca === "quitada";
            return (
              <TableRow
                key={`${f.cuentaId}-${f.aparicion}-${f.marca}`}
                className={cn(quitada && "text-muted-foreground")}
              >
                <TableCell className={cn("tabular-nums", quitada && "line-through")}>{f.codigo}</TableCell>
                <TableCell>
                  <span className={cn("mr-2", quitada && "line-through")}>{f.nombre}</span>
                  {ESTILO_MARCA[f.marca] && (
                    <Badge variant={ESTILO_MARCA[f.marca]}>{T.marcas[f.marca]}</Badge>
                  )}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", quitada && "line-through")}>
                  {formatearDinero(f.debe, { simbolo: false })}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", quitada && "line-through")}>
                  {formatearDinero(f.haber, { simbolo: false })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>{T.totales}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatearDinero(elegida.partida.totalDebe, { simbolo: false })}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatearDinero(elegida.partida.totalHaber, { simbolo: false })}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}

/**
 * Historial de versiones de una partida contabilizada: la lista de versiones y las líneas de la que se
 * elija, marcando lo que cambió respecto a la anterior (HU-23, S2-T09).
 */
export function HistorialVersiones({ empresaId, partida }: { empresaId: string; partida: PartidaVista }) {
  const consulta = useQuery(versionesQuery(empresaId, partida.id));
  const [numero, setNumero] = useState<number>();

  if (consulta.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {T.cargando}
      </p>
    );
  }
  if (consulta.isError) {
    return (
      <Alert variant="error">
        <p>{T.error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => void consulta.refetch()}
        >
          {T.reintentar}
        </Button>
      </Alert>
    );
  }

  const versiones = armarVersiones(partida, consulta.data);
  const vigente = versiones[0];
  const elegida = versiones.find((v) => v.numero === numero) ?? vigente;
  if (!vigente || !elegida) return null;

  return (
    <section
      aria-labelledby="historial-titulo"
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="lg:order-1">
        <LineasVersion
          versiones={versiones}
          elegida={elegida}
          onVerVigente={() => setNumero(vigente.numero)}
        />
      </div>
      <Card className="overflow-hidden lg:order-2">
        <div className="border-b border-border px-5 py-4">
          <h2 id="historial-titulo" className="flex items-center gap-2 font-semibold">
            <History aria-hidden="true" className="size-4" />
            {T.titulo}
          </h2>
          <p className="text-sm text-muted-foreground">{T.subtitulo}</p>
        </div>
        <ListaVersiones versiones={versiones} elegida={elegida.numero} onElegir={setNumero} />
        {versiones.length === 1 && (
          <p className="px-5 pb-4 text-xs text-muted-foreground">{T.sinEdiciones}</p>
        )}
      </Card>
    </section>
  );
}
