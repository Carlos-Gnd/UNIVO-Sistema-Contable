import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Enlace } from "@/components/enlace";
import { alertasQuery } from "./calendario-api";
import { TEXTOS_CALENDARIO } from "./textos";

const T = TEXTOS_CALENDARIO.alerta;

/**
 * Aviso para el tablero: los vencimientos que faltan cinco días o menos y los ya vencidos sin presentar. No muestra
 * nada si no hay ninguno o si el usuario no puede ver el calendario (la API responde 403).
 */
export function AlertaVencimientos({ empresaId }: { empresaId: string }) {
  const alertas = useQuery(alertasQuery(empresaId));
  const lista = alertas.data?.alertas ?? [];
  if (lista.length === 0) return null;

  return (
    <Alert variant="error" aria-label={T.titulo}>
      <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="grid gap-1">
        <ul className="grid gap-0.5">
          {lista.map((v) => (
            <li key={`${v.obligacion}-${v.periodo}`}>
              {v.estado === "vencida" ? T.vencida(v.titulo) : T.proxima(v.titulo, v.diasRestantes)}
            </li>
          ))}
        </ul>
        <Enlace
          href={`/empresas/${encodeURIComponent(empresaId)}/calendario-tributario`}
          className="font-semibold underline"
        >
          {T.ver}
        </Enlace>
      </div>
    </Alert>
  );
}
