import { queryOptions } from "@tanstack/react-query";
import type { AnexosF07Vista } from "@contable/shared";
import { api } from "@/lib/api";

/** Primer y último día del mes AAAA-MM, como AAAA-MM-DD. */
export function limitesDelMes(periodo: string): { desde: string; hasta: string } {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}

/** Anexos del F-07 del mes, de toda la empresa (HU-51). */
export const anexosF07Query = (empresaId: string, periodo: string) => {
  const { desde, hasta } = limitesDelMes(periodo);
  return queryOptions({
    queryKey: ["empresas", empresaId, "libros-iva", "anexos-f07", desde, hasta] as const,
    queryFn: ({ signal }) =>
      api<AnexosF07Vista>(
        `/empresas/${encodeURIComponent(empresaId)}/libros-iva/anexos-f07?desde=${desde}&hasta=${hasta}`,
        { senal: signal },
      ),
  });
};
