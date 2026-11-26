import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { evaluarRetencionPercepcion, type ClasificacionContribuyente } from "@contable/shared";
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
import { NativeSelect } from "@/components/ui/native-select";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { usePermiso } from "@/modules/organizacion/permisos";
import { FilaResumen } from "@/modules/tributario/pago-a-cuenta/pantalla-pago-a-cuenta";
import { retencionPercepcionQuery } from "./retencion-percepcion-api";
import { TEXTOS_RETENCION_PERCEPCION as T } from "./textos";

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

const CLASIFICACIONES: ClasificacionContribuyente[] = ["grande", "mediano", "otro"];

function SelectorClasificacion({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string;
  valor: ClasificacionContribuyente;
  onCambio: (valor: ClasificacionContribuyente) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {etiqueta}
      <NativeSelect value={valor} onChange={(e) => onCambio(e.target.value as ClasificacionContribuyente)}>
        {CLASIFICACIONES.map((c) => (
          <option key={c} value={c}>
            {T.clasificaciones[c]}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

/** Calculadora: muestra qué hace el sistema con una operación, con la misma regla que los documentos. */
function DialogoProbar({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [empresa, setEmpresa] = useState<ClasificacionContribuyente>("otro");
  const [tercero, setTercero] = useState<ClasificacionContribuyente>("grande");
  const [operacion, setOperacion] = useState<"compra" | "venta">("venta");
  const [base, setBase] = useState("250.00");
  const baseValida = /^\d+(\.\d{1,2})?$/.test(base.trim());
  const resultado = baseValida
    ? evaluarRetencionPercepcion({ empresa, tercero, operacion, base: base.trim() })
    : null;
  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{T.probar.titulo}</DialogTitle>
          <DialogDescription>{T.probar.descripcion}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectorClasificacion etiqueta={T.probar.empresa} valor={empresa} onCambio={setEmpresa} />
          <SelectorClasificacion etiqueta={T.probar.tercero} valor={tercero} onCambio={setTercero} />
          <label className="grid gap-1.5 text-sm font-medium">
            {T.probar.operacion}
            <NativeSelect
              value={operacion}
              onChange={(e) => setOperacion(e.target.value as "compra" | "venta")}
            >
              <option value="venta">{T.operaciones.venta}</option>
              <option value="compra">{T.operaciones.compra}</option>
            </NativeSelect>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {T.probar.base}
            <Input
              inputMode="decimal"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              aria-invalid={!baseValida}
              className="tabular-nums"
            />
          </label>
        </div>
        {!baseValida && <Alert variant="error">{T.probar.baseInvalida}</Alert>}
        {resultado && (
          <Alert>
            <p className="font-semibold">
              {T.probar[resultado.tipo]}
              {resultado.tipo !== "ninguna" && <> · {formatearDinero(resultado.monto)}</>}
            </p>
            <p>
              {resultado.tipo === "ninguna" && resultado.motivo
                ? T.probar.motivos[resultado.motivo]
                : resultado.sentido
                  ? T.probar[resultado.sentido]
                  : null}
            </p>
          </Alert>
        )}
        <DialogFooter>
          <Button onClick={onCerrar}>{T.probar.listo}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Contenido de la pestaña de retención y percepción del 1 % del mes, con su efecto en el F-07 (HU-50). */
export function ContenidoRetencionPercepcion({ empresaId, periodo }: { empresaId: string; periodo: string }) {
  const [probando, setProbando] = useState(false);
  const puedeProbar = usePermiso("declaraciones.generar");
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const periodoValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100 && mes >= 1 && mes <= 12;
  const consulta = useQuery({
    ...retencionPercepcionQuery(empresaId, anio, mes),
    enabled: Boolean(empresaId) && periodoValido,
  });
  const vista = consulta.data;

  return (
    <>
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

      {vista && (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">{T.titulo}</h2>
                <p className="text-sm text-muted-foreground">
                  {T.descripcion} {T.clasificacionEmpresa(T.clasificaciones[vista.clasificacionEmpresa])}
                </p>
              </div>
              {puedeProbar && (
                <Button variant="outline" onClick={() => setProbando(true)}>
                  {T.probar.boton}
                </Button>
              )}
            </div>
            {vista.filas.length === 0 ? (
              <p className="px-4 py-6 text-muted-foreground">
                {T.vacio(MESES[vista.mes - 1] ?? "", vista.anio)}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {T.columnas.fecha}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {T.columnas.documento}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {T.columnas.operacion}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {T.columnas.tercero}
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">
                        {T.columnas.base}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {T.columnas.tipo}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {T.columnas.efecto}
                      </th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">
                        {T.columnas.monto}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vista.filas.map((f) => (
                      <tr key={`${f.documentoId}-${f.tipo}`} className="border-t border-border">
                        <td className="px-4 py-2 whitespace-nowrap">{formatearFecha(f.fecha)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {f.numeroDocumento}
                          {f.anulado && (
                            <Badge variant="tachada" className="ml-2">
                              {T.anulado}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2">{T.operaciones[f.operacion]}</td>
                        <td className="px-4 py-2">
                          {f.tercero ?? T.sinTercero}
                          <span className="block text-xs text-muted-foreground">
                            {T.clasificaciones[f.clasificacionTercero]}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatearDinero(f.baseGravada)}
                        </td>
                        <td className="px-4 py-2">{T.tipos[f.tipo]}</td>
                        <td className="px-4 py-2">{T.efectos[f.sentido]}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatearDinero(f.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {vista.filas.length > 0 && (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <caption className="bg-muted/50 px-4 py-2 text-left font-medium">{T.totales.titulo}</caption>
                <tbody>
                  <FilaResumen etiqueta={T.totales.percibidoSufrido} monto={vista.totales.percibidoSufrido} />
                  <FilaResumen etiqueta={T.totales.retenidoSufrido} monto={vista.totales.retenidoSufrido} />
                  <FilaResumen
                    etiqueta={T.totales.percibidoEfectuado}
                    monto={vista.totales.percibidoEfectuado}
                  />
                  <FilaResumen
                    etiqueta={T.totales.retenidoEfectuado}
                    monto={vista.totales.retenidoEfectuado}
                  />
                </tbody>
              </table>
            </Card>
          )}
          <p className="text-sm text-muted-foreground">{T.nota}</p>
        </>
      )}
      <DialogoProbar abierto={probando} onCerrar={() => setProbando(false)} />
    </>
  );
}
