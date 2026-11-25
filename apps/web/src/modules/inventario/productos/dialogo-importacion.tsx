import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  MAXIMO_BYTES_IMPORTACION,
  type ReporteImportacionProductos,
  type ResultadoImportacionProductos,
} from "@contable/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, apiArchivo, mensajeDeError } from "@/lib/api";
import { TEXTOS_IMPORTACION_PRODUCTOS as T } from "./textos-importacion";

const base = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/productos/importacion`;

function formulario(archivo: File) {
  const datos = new FormData();
  datos.append("archivo", archivo);
  return datos;
}

function guardar(contenido: Blob, nombre: string) {
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(contenido);
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

interface Props {
  empresaId: string;
  abierto: boolean;
  onCerrar: () => void;
}

/** Importación de productos desde Excel (HU-64): plantilla, revisión por fila y carga todo o nada. */
export function DialogoImportacionProductos({ empresaId, abierto, onCerrar }: Props) {
  const cliente = useQueryClient();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [reporte, setReporte] = useState<ReporteImportacionProductos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validar = useMutation({
    mutationFn: (f: File) =>
      api<ReporteImportacionProductos>(`${base(empresaId)}/validar`, {
        metodo: "POST",
        cuerpo: formulario(f),
      }),
    onSuccess: setReporte,
    onError: (e) => setError(mensajeDeError(e)),
  });
  const cargar = useMutation({
    mutationFn: (f: File) =>
      api<ResultadoImportacionProductos>(`${base(empresaId)}/cargar`, {
        metodo: "POST",
        cuerpo: formulario(f),
      }),
    onSuccess: (resultado) => {
      if (resultado.creados > 0) {
        toast.success(T.creados(resultado.creados));
        void cliente.invalidateQueries({ queryKey: ["empresas", empresaId, "inventario"] });
        cerrar();
      } else {
        setReporte(resultado.reporte);
      }
    },
    onError: (e) => setError(mensajeDeError(e)),
  });

  function cerrar() {
    setArchivo(null);
    setReporte(null);
    setError(null);
    onCerrar();
  }

  function elegir(f: File | null) {
    setReporte(null);
    setError(null);
    if (f && !/\.xlsx$/i.test(f.name)) {
      setError(T.noEsExcel);
      setArchivo(null);
    } else if (f && f.size > MAXIMO_BYTES_IMPORTACION) {
      setError(T.muyGrande);
      setArchivo(null);
    } else {
      setArchivo(f);
    }
  }

  async function plantilla() {
    try {
      const r = await apiArchivo(`${base(empresaId)}/plantilla`);
      guardar(r.contenido, r.nombre ?? "plantilla-productos.xlsx");
    } catch (e) {
      setError(`${T.errorPlantilla} ${mensajeDeError(e)}`);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{T.titulo}</DialogTitle>
          <DialogDescription>{T.descripcion}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => void plantilla()}>
              <Download aria-hidden="true" />
              {T.plantilla}
            </Button>
          </div>
          <label className="grid gap-1 text-sm">
            {T.archivo}
            <Input type="file" accept=".xlsx" onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
          </label>
          {error && <Alert variant="error">{error}</Alert>}
          {reporte && reporte.valido && <Alert>{T.valido(reporte.filas.length)}</Alert>}
          {reporte && !reporte.valido && (
            <div className="grid gap-2">
              <Alert variant="error">{T.conErrores(reporte.errores.length)}</Alert>
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="p-2 font-normal">{T.columnas.fila}</th>
                      <th className="p-2 font-normal">{T.columnas.columna}</th>
                      <th className="p-2 font-normal">{T.columnas.problema}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.errores.map((e, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 tabular-nums">{e.fila ?? "—"}</td>
                        <td className="p-2">{e.columna ?? "—"}</td>
                        <td className="p-2">{e.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar}>
            {T.cerrar}
          </Button>
          <Button
            type="button"
            variant={reporte?.valido ? "outline" : "default"}
            disabled={!archivo || validar.isPending}
            onClick={() => archivo && validar.mutate(archivo)}
          >
            {validar.isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {validar.isPending ? T.revisando : T.revisar}
          </Button>
          {reporte?.valido && archivo && (
            <Button type="button" disabled={cargar.isPending} onClick={() => cargar.mutate(archivo)}>
              {cargar.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {cargar.isPending ? T.creando : T.cargar(reporte.filas.length)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
