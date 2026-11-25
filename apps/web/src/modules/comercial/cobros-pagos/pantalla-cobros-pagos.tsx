import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dinero, type DocumentoPendiente, type OperacionComercial } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { Pestanas } from "@/modules/reportes/comun/pestanas";
import { abonosQuery, pendientesQuery } from "./cobros-pagos-api";
import { AntiguedadSaldos } from "./antiguedad-saldos";
import { DialogoAbono } from "./dialogo-abono";
import { TEXTOS_ANTIGUEDAD, TEXTOS_COBROS_PAGOS as T } from "./textos";

type Lado = "cobrar" | "pagar" | "antiguedad";
type LadoSaldos = Exclude<Lado, "antiguedad">;
const OPERACION: Record<LadoSaldos, OperacionComercial> = { cobrar: "venta", pagar: "compra" };

/** Cobros y pagos (HU-62): saldos por cobrar y por pagar, y registro de abonos a uno o varios documentos. */
export function PantallaCobrosPagos({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const [lado, setLado] = useState<Lado>("cobrar");
  return (
    <Pagina className="max-w-[1120px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      <Pestanas
        etiqueta={T.pestanas.etiqueta}
        valor={lado}
        opciones={[
          { valor: "cobrar", texto: T.pestanas.cobrar },
          { valor: "pagar", texto: T.pestanas.pagar },
          { valor: "antiguedad", texto: TEXTOS_ANTIGUEDAD.pestana },
        ]}
        onCambio={setLado}
        idPanel="panel-cobros-pagos"
      />
      <div id="panel-cobros-pagos" role="tabpanel" aria-labelledby={`pestana-${lado}`} className="grid gap-5">
        {lado === "antiguedad" ? (
          <AntiguedadSaldos empresaId={empresaId} />
        ) : (
          <SaldosPorLado key={lado} empresaId={empresaId} lado={lado} />
        )}
      </div>
    </Pagina>
  );
}

function SaldosPorLado({ empresaId, lado }: { empresaId: string; lado: LadoSaldos }) {
  const operacion = OPERACION[lado];
  const puedeRegistrar = usePermiso("operaciones.registrar");
  const pendientes = useQuery(pendientesQuery(empresaId, operacion));
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [abriendo, setAbriendo] = useState(false);

  const documentos = pendientes.data ?? [];
  const seleccion = documentos.filter((d) => elegidos.has(d.id));
  const terceroElegido = seleccion[0]?.tercero.id;
  const saldoElegido = Dinero.sumar(seleccion.map((d) => d.saldo)).aTexto();
  const hoy = hoyIso();

  const alternar = (d: DocumentoPendiente, marcado: boolean) =>
    setElegidos((s) => {
      const nuevo = new Set(s);
      if (marcado) nuevo.add(d.id);
      else nuevo.delete(d.id);
      return nuevo;
    });

  if (pendientes.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {T.cargando}
      </p>
    );
  }
  if (pendientes.isError) {
    return (
      <Alert variant="error">
        <p>
          {T.errorCarga} {mensajeDeError(pendientes.error)}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void pendientes.refetch()}>
          {T.reintentar}
        </Button>
      </Alert>
    );
  }

  return (
    <>
      {documentos.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">{T.vacio[lado]}</Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">{T.columnas.elegir}</span>
                </TableHead>
                <TableHead>{T.columnas.tercero[lado]}</TableHead>
                <TableHead>{T.columnas.documento}</TableHead>
                <TableHead>{T.columnas.fecha}</TableHead>
                <TableHead>{T.columnas.vence}</TableHead>
                <TableHead className="text-right">{T.columnas.monto}</TableHead>
                <TableHead className="text-right">{T.columnas.abonado}</TableHead>
                <TableHead className="text-right">{T.columnas.saldo}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentos.map((d) => {
                const nombre = `${T.tiposDocumento[d.tipoDocumento]} ${d.numeroDocumento}`;
                const otroTercero = terceroElegido !== undefined && terceroElegido !== d.tercero.id;
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      {puedeRegistrar && (
                        <Checkbox
                          aria-label={T.elegirDocumento(nombre)}
                          title={otroTercero ? T.otroTercero : undefined}
                          checked={elegidos.has(d.id)}
                          disabled={otroTercero}
                          onChange={(e) => alternar(d, e.target.checked)}
                        />
                      )}
                    </TableCell>
                    <TableCell>{d.tercero.nombre}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{nombre}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatearFecha(d.fecha)}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatearFecha(d.fechaVencimiento)}
                      {d.fechaVencimiento < hoy && (
                        <Badge variant="neutra" className="ml-2">
                          {T.vencido}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatearDinero(d.totalNeto)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearDinero(d.abonado)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatearDinero(d.saldo)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {puedeRegistrar && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
              <span className="text-sm text-muted-foreground">
                {seleccion.length > 0
                  ? T.seleccion(seleccion.length, formatearDinero(saldoElegido))
                  : T.sinSeleccion}
              </span>
              <div className="flex-1" />
              <Button disabled={seleccion.length === 0} onClick={() => setAbriendo(true)}>
                {T.registrar[lado]}
              </Button>
            </div>
          )}
        </Card>
      )}

      <Historial empresaId={empresaId} lado={lado} />

      <DialogoAbono
        empresaId={empresaId}
        operacion={operacion}
        documentos={seleccion}
        abierto={abriendo}
        onCerrar={() => setAbriendo(false)}
        onRegistrado={() => setElegidos(new Set())}
      />
    </>
  );
}

function Historial({ empresaId, lado }: { empresaId: string; lado: LadoSaldos }) {
  const abonos = useQuery(abonosQuery(empresaId, OPERACION[lado]));
  const H = T.historial;
  return (
    <section aria-labelledby={`historial-${lado}`} className="grid gap-3">
      <h2 id={`historial-${lado}`} className="text-base font-semibold">
        {H[lado]}
      </h2>
      {abonos.isSuccess && abonos.data.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">{H.vacio}</Card>
      )}
      {abonos.isError && <Alert variant="error">{mensajeDeError(abonos.error)}</Alert>}
      {abonos.isSuccess && abonos.data.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{H.columnas.fecha}</TableHead>
                <TableHead>{H.columnas.tercero}</TableHead>
                <TableHead>{H.columnas.referencia}</TableHead>
                <TableHead className="text-right">{H.columnas.monto}</TableHead>
                <TableHead>{H.columnas.partida}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {abonos.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="tabular-nums whitespace-nowrap">{formatearFecha(a.fecha)}</TableCell>
                  <TableCell>{a.tercero.nombre}</TableCell>
                  <TableCell>{a.referencia ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearDinero(a.monto)}</TableCell>
                  <TableCell>
                    <Badge variant={a.estadoPartida === "borrador" ? "neutra" : "solida"}>
                      {T.estadoPartida[a.estadoPartida]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}
