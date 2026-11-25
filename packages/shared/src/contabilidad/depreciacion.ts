import { Dinero, type Monto } from "../dinero/dinero";

/** Categorías de activo fijo, según los porcentajes máximos de depreciación del Art. 30 de la LISR. */
export const CATEGORIAS_ACTIVO = [
  "edificaciones",
  "instalaciones",
  "equipo_transporte",
  "mobiliario_equipo",
] as const;
export type CategoriaActivo = (typeof CATEGORIAS_ACTIVO)[number];

/** Porcentaje anual máximo deducible por categoría (Art. 30 LISR): edificaciones 5 %, maquinaria 20 %, vehículos 25 %, otros bienes muebles 50 %. */
export const TASA_MAXIMA_FISCAL: Record<CategoriaActivo, number> = {
  edificaciones: 5,
  instalaciones: 20,
  equipo_transporte: 25,
  mobiliario_equipo: 50,
};

/** Vida útil mínima, en años, para no exceder el porcentaje fiscal de la categoría. */
export const vidaMinimaAnios = (categoria: CategoriaActivo): number =>
  Math.ceil(100 / TASA_MAXIMA_FISCAL[categoria]);

/** Porcentaje anual de depreciación en línea recta para una vida útil (100 / años), con dos decimales. */
export const tasaAnual = (vidaUtilAnios: number): string => (100 / vidaUtilAnios).toFixed(2);

export interface DatosDepreciacion {
  costo: Monto;
  valorResidual: Monto;
  vidaUtilAnios: number;
  /** AAAA-MM-DD; la depreciación empieza en el mes de la adquisición */
  fechaAdquisicion: string;
}

export interface FilaCuadro {
  /** Primer día del mes (AAAA-MM-01) */
  mes: string;
  cuota: string;
  acumulada: string;
  valorEnLibros: string;
}

/** Primer día del mes después de uno dado (AAAA-MM-01). */
export function sumarMeses(mes: string, meses: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/**
 * Cuadro de depreciación en línea recta: (costo − valor residual) entre los meses de vida útil, desde el mes de
 * adquisición. La última cuota absorbe el redondeo para que la depreciación acumulada sea exactamente la base
 * depreciable y el valor en libros quede en el valor residual.
 */
export function cuadroDepreciacion(d: DatosDepreciacion): FilaCuadro[] {
  const costo = Dinero.de(d.costo);
  const residual = Dinero.de(d.valorResidual);
  const base = costo.menos(residual);
  const meses = d.vidaUtilAnios * 12;
  const cuotaNormal = base.dividirEntre(meses);
  const inicio = `${d.fechaAdquisicion.slice(0, 7)}-01`;
  const filas: FilaCuadro[] = [];
  let acumulada = Dinero.cero();
  for (let i = 0; i < meses; i++) {
    const cuota = i === meses - 1 ? base.menos(acumulada) : cuotaNormal;
    acumulada = acumulada.mas(cuota);
    filas.push({
      mes: sumarMeses(inicio, i),
      cuota: cuota.aTexto(),
      acumulada: acumulada.aTexto(),
      valorEnLibros: costo.menos(acumulada).aTexto(),
    });
  }
  return filas;
}
