import { CircleCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { TEXTOS_REPORTES as T } from "./textos";

interface IndicadorCuadreProps {
  cuadra: boolean;
  /** Qué debe cuadrar, por ejemplo «Saldos deudores y acreedores» */
  etiqueta: string;
  /** Diferencias ya formateadas, una por sección que no cuadra; se ignoran si cuadra */
  diferencias?: readonly { etiqueta: string; monto: string }[];
}

/** Indica si un reporte cuadra; si no, avisa con la diferencia para no usarlo hasta revisarlo (RNF-01). */
export function IndicadorCuadre({ cuadra, etiqueta, diferencias = [] }: IndicadorCuadreProps) {
  if (cuadra) {
    return (
      <p
        role="status"
        className="inline-flex h-9 w-fit items-center gap-2 rounded-full bg-secondary px-3.5 text-sm font-semibold"
      >
        <CircleCheck aria-hidden="true" className="size-4" />
        {T.cuadra(etiqueta)}
      </p>
    );
  }
  return (
    <Alert variant="error">
      <p>
        <b className="font-semibold">{T.noCuadra}</b>{" "}
        {diferencias.map((d) => T.diferencia(d.etiqueta, d.monto)).join(" ")} {T.revisar}
      </p>
    </Alert>
  );
}
