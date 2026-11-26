import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, FilePlus2 } from "lucide-react";
import { Dinero } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Campo } from "@/components/campo";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { formatearDinero, hoyIso } from "@/lib/formato";
import { activosQuery } from "../activos/activos-api";
import { Permiso, usePermiso } from "@/modules/organizacion/permisos";
import { CuadroActivo } from "./cuadro-activo";
import { depreciacionQuery, mesesDisponibles } from "./depreciacion-api";
import { DialogoGenerar } from "./dialogo-generar";
import { ESTADOS, nombreDelMes, TEXTOS_DEPRECIACION as T } from "./textos";

type Pestana = "mes" | "cuadro";
const dinero = (monto: string) => formatearDinero(monto, { simbolo: false });

/** Pantalla de depreciación: mes a depreciar con su partida y cuadro por activo (S3-T131, HU-82). */
export function PantallaDepreciacion({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeGenerar = usePermiso("ajustes.generar");
  const meses = mesesDisponibles(hoyIso());
  const [pestana, setPestana] = useState<Pestana>("mes");
  const [mes, setMes] = useState(meses[0] ?? "");
  const [confirmando, setConfirmando] = useState(false);
  const vista = useQuery(depreciacionQuery(empresaId, mes));
  const activos = useQuery(activosQuery(empresaId));

  const filas = vista.data?.activos ?? [];
  const pendiente = filas.some((f) => f.estado === "pendiente");
  const generada = filas.some((f) => f.estado === "generada") && !pendiente;
  const total = (campo: "costo" | "cuota" | "acumulada" | "valorEnLibros") =>
    Dinero.sumar(filas.map((f) => f[campo])).aTexto();

  return (
    <Pagina>
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion}>
        {puedeGenerar && (
          <Button
            className="h-11 rounded-full px-5"
            disabled={!pendiente}
            onClick={() => setConfirmando(true)}
          >
            <FilePlus2 aria-hidden="true" />
            {T.generar}
          </Button>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            [T.tarjetas.costo, "costo"],
            [T.tarjetas.cuota, "cuota"],
            [T.tarjetas.acumulada, "acumulada"],
            [T.tarjetas.enLibros, "valorEnLibros"],
          ] as const
        ).map(([titulo, campo]) => (
          <Card key={campo} className="grid gap-1 p-4">
            <span className="text-xs text-muted-foreground">{titulo}</span>
            <b className="text-xl font-semibold tabular-nums">{dinero(total(campo))}</b>
          </Card>
        ))}
      </div>

      <div role="tablist" aria-label={T.titulo} className="flex gap-1 border-b border-border">
        {(["mes", "cuadro"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pestana === p}
            onClick={() => setPestana(p)}
            className={`-mb-px h-11 border-b-2 px-4 font-semibold whitespace-nowrap focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
              pestana === p
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {T.pestanas[p]}
          </button>
        ))}
      </div>

      {pestana === "mes" ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 sm:px-5">
            <Campo id="depreciacion-mes" etiqueta={T.mes} className="w-52">
              {(p) => (
                <NativeSelect {...p} className="h-10" value={mes} onChange={(e) => setMes(e.target.value)}>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {nombreDelMes(m)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Campo>
            <div className="flex-1" />
            {generada && (
              <Badge>
                <CircleCheck aria-hidden="true" className="size-3.5" />
                {T.estadoMes.generada}
              </Badge>
            )}
            {pendiente && <Badge variant="contorno">{T.estadoMes.pendiente}</Badge>}
          </div>

          {vista.isPending && (
            <p role="status" className="p-5 text-muted-foreground">
              {T.cargando}
            </p>
          )}
          {vista.isError && (
            <Alert variant="error" className="m-4">
              <p>
                {T.errorCarga} {mensajeDeError(vista.error)}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void vista.refetch()}>
                {T.reintentar}
              </Button>
            </Alert>
          )}
          {vista.isSuccess && filas.length === 0 && (
            <p className="p-8 text-center text-muted-foreground">
              {activos.data?.length === 0 ? T.vacioSinActivos : T.vacio}
            </p>
          )}
          {filas.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.tabla.codigo}</TableHead>
                  <TableHead>{T.tabla.activo}</TableHead>
                  <TableHead className="text-right">{T.tabla.costo}</TableHead>
                  <TableHead className="text-right">{T.tabla.tasa}</TableHead>
                  <TableHead className="text-right">{T.tabla.cuota}</TableHead>
                  <TableHead className="text-right">{T.tabla.acumulada}</TableHead>
                  <TableHead className="text-right">{T.tabla.enLibros}</TableHead>
                  <TableHead>{T.tabla.estado}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.activoId}>
                    <TableCell className="tabular-nums text-muted-foreground">{f.codigo}</TableCell>
                    <TableCell>{f.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{dinero(f.costo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.tasaAnual} %</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{dinero(f.cuota)}</TableCell>
                    <TableCell className="text-right tabular-nums">{dinero(f.acumulada)}</TableCell>
                    <TableCell className="text-right tabular-nums">{dinero(f.valorEnLibros)}</TableCell>
                    <TableCell>
                      <Badge variant={f.estado === "pendiente" ? "contorno" : "neutra"}>
                        {f.estado === "bloqueada" && f.mesPendiente
                          ? T.tabla.faltaMes(f.mesPendiente)
                          : ESTADOS[f.estado]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="grid gap-1.5 border-t border-border p-5 text-sm text-muted-foreground">
            <b className="font-semibold text-foreground">{T.articulo30}</b>
            <span>{T.articulo30Detalle}</span>
          </div>
        </Card>
      ) : (
        <CuadroActivo
          empresaId={empresaId}
          activos={(activos.data ?? []).filter((a) => a.estado === "activo")}
        />
      )}

      <p className="text-xs text-muted-foreground">{T.nota}</p>

      <Permiso requiere="ajustes.generar">
        {vista.data && (
          <DialogoGenerar
            empresaId={empresaId}
            abierto={confirmando}
            vista={vista.data}
            onCerrar={() => setConfirmando(false)}
          />
        )}
      </Permiso>
    </Pagina>
  );
}
