import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrearEjercicio } from "@contable/shared";
import { api } from "@/lib/api";
import type { EjercicioDetalle } from "./tipos";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/ejercicios`;
const clave = (empresaId: string) => ["empresas", empresaId, "ejercicios"] as const;

export const ejerciciosQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<EjercicioDetalle[]>(ruta(empresaId), { senal: signal }),
  });

/** Crea el ejercicio; la API genera sus doce períodos mensuales abiertos (S1-T74). */
export function useCrearEjercicio(empresaId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearEjercicio) =>
      api<EjercicioDetalle>(ruta(empresaId), { metodo: "POST", cuerpo: datos }),
    onSuccess: (creado) => {
      cliente.setQueryData<EjercicioDetalle[]>(clave(empresaId), (lista = []) => [
        ...lista.filter((e) => e.id !== creado.id),
        creado,
      ]);
      void cliente.invalidateQueries({ queryKey: clave(empresaId) });
    },
  });
}

/** Ejercicio de un año calendario, como lo pide crearEjercicioSchema. */
export const ejercicioDelAnio = (anio: number): CrearEjercicio => ({
  anio,
  fechaInicio: `${anio}-01-01`,
  fechaFin: `${anio}-12-31`,
});

/** El ejercicio del año en curso si existe; si no, el más reciente. */
export function ejercicioInicial(
  ejercicios: readonly EjercicioDetalle[],
  anioActual: number,
): number | undefined {
  if (ejercicios.length === 0) return undefined;
  if (ejercicios.some((e) => e.anio === anioActual)) return anioActual;
  return Math.max(...ejercicios.map((e) => e.anio));
}
