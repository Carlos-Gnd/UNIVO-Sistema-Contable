import { Alert } from "@/components/ui/alert";
import { TEXTOS_ESQUEMA_T as T } from "./textos";

export interface CuentaConSaldoContrario {
  id: string;
  codigo: string;
  nombre: string;
  href?: string;
}

/** Resumen reutilizable para identificar las cuentas cuyo saldo contradice su naturaleza. */
export function AlertaSaldoContrario({ cuentas }: { cuentas: readonly CuentaConSaldoContrario[] }) {
  if (cuentas.length === 0) return null;

  return (
    <Alert variant="error" className="rounded-xl">
      <p>
        {T.indicadorSaldoContrario(cuentas.length)}:{" "}
        {cuentas.map((cuenta, indice) => (
          <span key={cuenta.id}>
            {indice > 0 && ", "}
            {cuenta.href ? (
              <a className="font-medium underline underline-offset-2" href={cuenta.href}>
                {cuenta.codigo} {cuenta.nombre}
              </a>
            ) : (
              <span className="font-medium underline underline-offset-2">
                {cuenta.codigo} {cuenta.nombre}
              </span>
            )}
          </span>
        ))}
      </p>
    </Alert>
  );
}
