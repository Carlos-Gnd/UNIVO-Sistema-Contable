import type { ReporteImportacion, TipoImportacion } from "@contable/shared";
import { api, apiArchivo } from "@/lib/api";

const ruta = (empresaId: string, tipo: TipoImportacion) =>
  `/empresas/${encodeURIComponent(empresaId)}/importacion/${tipo}`;

/** Plantilla de Excel del tipo de importación (S1-T68), con el nombre que le da la API. */
export async function descargarPlantilla(
  empresaId: string,
  tipo: TipoImportacion,
): Promise<{ contenido: Blob; nombre: string }> {
  const { contenido, nombre } = await apiArchivo(`${ruta(empresaId, tipo)}/plantilla`);
  return { contenido, nombre: nombre ?? `plantilla-${tipo}.xlsx` };
}

/** Sube el Excel y devuelve el reporte de errores por fila, sin guardar nada (S1-T69). */
export function validarArchivo(
  empresaId: string,
  tipo: TipoImportacion,
  archivo: File,
): Promise<ReporteImportacion> {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  return api<ReporteImportacion>(`${ruta(empresaId, tipo)}/validar`, { metodo: "POST", cuerpo: formulario });
}
