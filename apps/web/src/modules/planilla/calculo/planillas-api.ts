import { useMutation } from "@tanstack/react-query";
import type { CalcularPlanilla, ResultadoCalculoPlanillaVista } from "@contable/shared";
import { api } from "@/lib/api";

const base = (empresaId: string) => "/empresas/" + encodeURIComponent(empresaId);

export function useCalcularPlanilla(empresaId: string) {
  return useMutation({
    mutationFn: (datos: CalcularPlanilla) =>
      api<ResultadoCalculoPlanillaVista>(base(empresaId) + "/planillas/calcular", {
        metodo: "POST",
        cuerpo: datos,
      }),
  });
}
