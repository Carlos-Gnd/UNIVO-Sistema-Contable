import { useQuery } from "@tanstack/react-query";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";

interface EncabezadoReporteProps {
  empresaId: string;
  titulo: string;
  /** Período o fecha del reporte, ya formateado */
  periodo: string;
  /** Sucursal o «Consolidado» */
  alcance: string;
}

/** Cabecera formal de un reporte: empresa, nombre del reporte, período y sucursal. */
export function EncabezadoReporte({ empresaId, titulo, periodo, alcance }: EncabezadoReporteProps) {
  const empresa = useQuery(empresaQuery(empresaId));
  return (
    <div className="grid gap-1 border-b border-border px-5 py-5 text-center sm:text-left">
      {empresa.data && (
        <p className="text-xs font-bold tracking-[.08em] text-muted-foreground uppercase">
          {empresa.data.nombreComercial ?? empresa.data.nombre}
        </p>
      )}
      <h2 className="text-xl font-medium">{titulo}</h2>
      <p className="text-sm text-muted-foreground">
        {periodo} · {alcance}
      </p>
    </div>
  );
}
