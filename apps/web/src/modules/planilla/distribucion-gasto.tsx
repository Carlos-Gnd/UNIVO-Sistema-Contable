import type { AreaGastoSinClasificar } from "@contable/shared";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";

interface TextosDistribucionGasto {
  titulo: string;
  descripcion: string;
  administracion: string;
  ventas: string;
  automatico: string;
  cuentaManual: (area: string) => string;
  seleccionarCuenta: string;
  sinAreasManuales: string;
}

export function DistribucionGasto({
  areas,
  cuentas,
  asignaciones,
  textos,
  onAsignar,
}: {
  areas: readonly AreaGastoSinClasificar[];
  cuentas: readonly CuentaCatalogo[];
  asignaciones: Readonly<Record<string, string>>;
  textos: TextosDistribucionGasto;
  onAsignar: (clave: string, cuentaId: string) => void;
}) {
  return (
    <Card className="grid gap-4 p-4">
      <div>
        <h2 className="font-semibold">{textos.titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{textos.descripcion}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <dt className="text-sm font-medium">{textos.administracion}</dt>
          <dd className="mt-1 text-sm text-muted-foreground">4201, {textos.automatico}</dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-sm font-medium">{textos.ventas}</dt>
          <dd className="mt-1 text-sm text-muted-foreground">4202, {textos.automatico}</dd>
        </div>
      </dl>
      {areas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{textos.sinAreasManuales}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {areas.map((area) => (
            <label key={area.clave} className="grid gap-1.5 text-sm font-medium">
              {textos.cuentaManual(area.etiqueta)}
              <NativeSelect
                value={asignaciones[area.clave] ?? ""}
                onChange={(evento) => onAsignar(area.clave, evento.target.value)}
              >
                <option value="">{textos.seleccionarCuenta}</option>
                {cuentas.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {cuenta.codigo} {cuenta.nombre}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}
