import type { ReactNode } from "react";
import type { SucursalDetalle } from "@contable/shared";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { usePermisos } from "@/modules/organizacion/permisos";
import { errorDeFiltros, type FiltrosReporte } from "./periodo";
import { TEXTOS_REPORTES } from "./textos";

const T = TEXTOS_REPORTES.filtros;

interface FiltrosReporteProps {
  valor: FiltrosReporte;
  onCambio: (cambios: Partial<FiltrosReporte>) => void;
  sucursales: readonly SucursalDetalle[];
  acciones?: ReactNode;
}

/** Período y sucursal (o consolidado) de un reporte; las fechas usan el selector nativo y las sucursales se limitan a las del rol. */
export function FiltrosDeReporte({ valor, onCambio, sucursales, acciones }: FiltrosReporteProps) {
  const error = errorDeFiltros(valor);
  const permisos = usePermisos();
  // Un usuario limitado a algunas sucursales solo puede elegir esas; una ajena daría 403
  const disponibles = sucursales.filter(
    (s) => permisos.todasSucursales || permisos.sucursales.includes(s.id),
  );
  return (
    <Card className="p-4">
      <h2 className="sr-only">{T.titulo}</h2>
      <div className="flex flex-wrap items-start gap-3">
        <Field className="w-[160px]" data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="reporte-desde">{T.desde}</FieldLabel>
          <Input
            id="reporte-desde"
            type="date"
            className="h-10 tabular-nums"
            value={valor.desde}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "reporte-filtros-error" : undefined}
            onChange={(e) => onCambio({ desde: e.target.value })}
          />
        </Field>
        <Field className="w-[160px]" data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="reporte-hasta">{T.hasta}</FieldLabel>
          <Input
            id="reporte-hasta"
            type="date"
            className="h-10 tabular-nums"
            value={valor.hasta}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "reporte-filtros-error" : undefined}
            onChange={(e) => onCambio({ hasta: e.target.value })}
          />
        </Field>
        <Field className="w-full sm:w-[240px]">
          <FieldLabel htmlFor="reporte-sucursal">{T.sucursal}</FieldLabel>
          <NativeSelect
            id="reporte-sucursal"
            className="h-10"
            value={valor.sucursalId}
            onChange={(e) => onCambio({ sucursalId: e.target.value })}
          >
            <option value="">{T.consolidado}</option>
            {disponibles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {acciones && <div className="ml-auto flex items-end">{acciones}</div>}
      </div>
      {error && (
        <FieldError id="reporte-filtros-error" className="mt-2">
          {error}
        </FieldError>
      )}
    </Card>
  );
}
