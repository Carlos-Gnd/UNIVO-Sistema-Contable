import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import type { DetalleIsrAnual, EstadoCierreAnual, PartidaAnualVista } from "@contable/shared";
import { navegar } from "@/app/navegacion";
import type { Parametros } from "@/app/rutas";
import { Enlace } from "@/components/enlace";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { cierreAnualQuery } from "@/modules/cierre-anual/cierre-anual-api";
import { TablaPartidaAnual } from "@/modules/cierre-anual/pantalla-cierre-anual";
import { usePermiso } from "@/modules/organizacion/permisos";
import { cambiosPatrimonioQuery } from "@/modules/reportes/estados-adicionales/patrimonio-api";
import { TEXTOS_CASO_SOCIEDAD as T } from "./textos";

const enEmpresa = (empresaId: string, ruta: string) => `/empresas/${encodeURIComponent(empresaId)}${ruta}`;

function Fila({ etiqueta, monto, destacada }: { etiqueta: string; monto: string; destacada?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className={`text-right text-sm tabular-nums ${destacada ? "font-bold" : "font-semibold"}`}>
        {formatearDinero(monto)}
      </dd>
    </div>
  );
}

function TarjetaCalculo({ detalle }: { detalle: DetalleIsrAnual }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Scale aria-hidden="true" className="size-5 text-muted-foreground" />
        <h2 className="font-semibold">{T.calculo.titulo}</h2>
      </div>
      <dl>
        <Fila etiqueta={T.calculo.utilidadAntes} monto={detalle.utilidadAntesImpuesto} />
        <Fila etiqueta={T.calculo.impuesto(detalle.tasaAplicada)} monto={detalle.impuestoDeterminado} />
        <Fila etiqueta={T.calculo.utilidadDespues} monto={detalle.utilidadDespuesDeImpuesto} destacada />
        <Fila etiqueta={T.calculo.capital} monto={detalle.capitalSocial} />
        <Fila etiqueta={T.calculo.limite} monto={detalle.limiteReservaLegal} />
        <Fila etiqueta={T.calculo.reservaActual} monto={detalle.reservaLegalActual} />
        <Fila etiqueta={T.calculo.disponible} monto={detalle.reservaLegalDisponible} />
        <Fila etiqueta={T.calculo.provision} monto={detalle.reservaLegalAProvisionar} destacada />
      </dl>
    </Card>
  );
}

function BloquePartida({
  titulo,
  partida,
  vista,
}: {
  titulo: string;
  partida: PartidaAnualVista | null;
  vista: EstadoCierreAnual["vistaCierre"] | EstadoCierreAnual["vistaReapertura"];
}) {
  const lineas = partida?.lineas ?? vista?.lineas ?? [];
  return (
    <section aria-label={titulo} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{titulo}</h3>
        {partida ? (
          <>
            <Badge variant={partida.estado === "contabilizada" ? "solida" : "neutra"}>
              {T.cierre.estado[partida.estado]}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatearFecha(partida.fecha)}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{T.cierre.sinPartida}</span>
        )}
      </div>
      {lineas.length > 0 ? (
        <TablaPartidaAnual lineas={lineas} />
      ) : (
        <p className="text-sm text-muted-foreground">{T.cierre.sinVista}</p>
      )}
    </section>
  );
}

function TarjetaPatrimonio({ empresaId, anio }: { empresaId: string; anio: number }) {
  const consulta = useQuery(
    cambiosPatrimonioQuery(empresaId, {
      desde: `${anio}-01-01`,
      hasta: `${anio}-12-31`,
      sucursalId: "",
      formato: "",
    }),
  );
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">{T.patrimonio.titulo}</h2>
      {consulta.isError && (
        <Alert variant="error">
          {T.patrimonio.error} {mensajeDeError(consulta.error)}
        </Alert>
      )}
      {consulta.data && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{T.patrimonio.concepto}</TableHead>
                {consulta.data.columnas.map((columna) => (
                  <TableHead key={columna.id} scope="col" className="text-right">
                    {columna.titulo}
                  </TableHead>
                ))}
                <TableHead scope="col" className="text-right">
                  {T.patrimonio.total}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.data.renglones.map((renglon) => (
                <TableRow key={renglon.id}>
                  <TableHead scope="row" className="font-normal">
                    {renglon.concepto}
                  </TableHead>
                  {renglon.valores.map((valor, indice) => (
                    <TableCell key={indice} className="text-right tabular-nums">
                      {formatearDinero(valor)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatearDinero(renglon.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-sm text-muted-foreground">
            {T.patrimonio.final}: <strong>{formatearDinero(consulta.data.patrimonioFinal)}</strong>
          </p>
        </div>
      )}
    </Card>
  );
}

/** Caso de una sociedad: reserva legal, impuesto, cierre con reapertura y patrimonio de un ejercicio (HU-91, S4-T41). */
export function PantallaCasoSociedad({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const consulta = useQuery(cierreAnualQuery(empresaId, anio));
  const puedeVerEstados = usePermiso("estados.ver");
  const estado = consulta.data;
  const esSociedad = estado?.tipoContribuyente === "sociedad";

  const selector = (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{T.ejercicio}</span>
      <NativeSelect
        aria-label={T.ejercicio}
        value={anio}
        onChange={(evento) => setAnio(Number(evento.currentTarget.value))}
      >
        {[anioActual - 3, anioActual - 2, anioActual - 1, anioActual].map((valor) => (
          <option key={valor} value={valor}>
            {valor}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  return (
    <Pagina>
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {selector}
      </EncabezadoPagina>

      {!empresaId && <Alert>{T.sinEmpresa}</Alert>}
      {consulta.isPending && empresaId && <p role="status">{T.cargando}</p>}
      {consulta.isError && (
        <Alert variant="error" role="alert">
          <p>
            {T.errorCarga} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {estado && !esSociedad && <Alert>{T.noEsSociedad}</Alert>}

      {estado && esSociedad && (
        <>
          {estado.detalleIsr ? (
            <TarjetaCalculo detalle={estado.detalleIsr} />
          ) : (
            <Alert>
              <p>{T.sinCalculo(anio)}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => navegar(enEmpresa(empresaId, "/cierre"))}
              >
                {T.irACierre}
              </Button>
            </Alert>
          )}

          <Card className="p-5">
            <CardHeader
              title={T.cierre.titulo}
              description={estado.ejercicioCerrado ? T.cierre.cerrado : T.cierre.abierto}
            />
            <div className="grid gap-5 p-5 pt-3">
              <BloquePartida
                titulo={T.cierre.cierre}
                partida={estado.partidaCierre}
                vista={estado.vistaCierre}
              />
              <BloquePartida
                titulo={T.cierre.reapertura}
                partida={estado.partidaReapertura}
                vista={estado.vistaReapertura}
              />
            </div>
          </Card>

          {puedeVerEstados && <TarjetaPatrimonio empresaId={empresaId} anio={anio} />}

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{T.estados.titulo}</h2>
            <div className="flex flex-wrap gap-2">
              {[
                [T.estados.resultados, "/estados"],
                [T.estados.balance, "/estados/balance-general"],
                [T.estados.patrimonio, "/estados/adicionales"],
              ].map(([texto, ruta]) => (
                <Enlace
                  key={ruta}
                  href={enEmpresa(empresaId, ruta!)}
                  className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                >
                  {texto}
                </Enlace>
              ))}
            </div>
          </Card>
        </>
      )}
    </Pagina>
  );
}
