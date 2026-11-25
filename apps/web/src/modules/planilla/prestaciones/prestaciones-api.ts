import { useMutation } from "@tanstack/react-query";
import type { CalcularPrestaciones, ResultadoCalculoPrestacionesVista } from "@contable/shared";
import { api } from "@/lib/api";

export function useCalcularPrestaciones(empresaId: string) {
  return useMutation({
    mutationFn: (datos: CalcularPrestaciones) =>
      api<ResultadoCalculoPrestacionesVista>(
        `/empresas/${encodeURIComponent(empresaId)}/prestaciones/calcular`,
        { metodo: "POST", cuerpo: datos },
      ),
  });
}
