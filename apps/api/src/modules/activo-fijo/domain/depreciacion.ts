import {
  Dinero,
  cuadroDepreciacion,
  mesesEntre,
  sumarMeses,
  ultimoDiaDelMes,
  type ActivoFijoVista,
  type EstadoDepreciacionMes,
  type FilaDepreciacionMes,
  type LineaPartida,
} from "@contable/shared";

/** Origen con el que quedan marcadas las partidas de depreciación (partidas.origen). */
export const ORIGEN_DEPRECIACION = "depreciacion";
export const PERMISO_GENERAR_DEPRECIACION = "ajustes.generar";

/** Un activo en el mes consultado: su fila para la pantalla y, si está pendiente, lo que se registrará. */
export interface PlanActivo {
  activo: ActivoFijoVista;
  fila: FilaDepreciacionMes;
}

/** Primer día del mes (AAAA-MM-01) de un texto AAAA-MM. */
export const primerDiaDelMes = (mes: string): string => `${mes}-01`;

const NOMBRES_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** «octubre de 2026» para el mes AAAA-MM (o su primer día). */
export const nombreDelMes = (mes: string): string =>
  `${NOMBRES_MES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

/**
 * Situación de cada activo en un mes (línea recta, desde el mes de adquisición):
 * - antes de su primer mes, el activo no aparece;
 * - los meses ya depreciados (hasta `ultimoMesDepreciado`) figuran como generada;
 * - solo se puede depreciar el mes siguiente al último depreciado: si faltan meses anteriores queda bloqueada;
 * - pasada su vida útil figura como terminada. Los activos dados de baja no se deprecian.
 */
export function planearDepreciacion(activos: readonly ActivoFijoVista[], mes: string): PlanActivo[] {
  const primero = primerDiaDelMes(mes);
  const plan: PlanActivo[] = [];
  for (const activo of activos) {
    if (activo.estado !== "activo") continue;
    const inicio = `${activo.fechaAdquisicion.slice(0, 7)}-01`;
    if (primero < inicio) continue;

    const cuadro = cuadroDepreciacion(activo);
    const fila = cuadro[mesesEntre(inicio, primero)];
    const base = {
      activoId: activo.id,
      codigo: activo.codigo,
      nombre: activo.nombre,
      sucursalId: activo.sucursalId,
      costo: activo.costo,
      tasaAnual: activo.tasaAnual,
    };
    if (!fila) {
      plan.push({
        activo,
        fila: {
          ...base,
          cuota: "0.00",
          acumulada: Dinero.de(activo.costo).menos(activo.valorResidual).aTexto(),
          valorEnLibros: Dinero.de(activo.valorResidual).aTexto(),
          estado: "terminada",
          mesPendiente: null,
        },
      });
      continue;
    }

    const ultimo = activo.ultimoMesDepreciado;
    const esperado = ultimo ? sumarMeses(ultimo, 1) : inicio;
    const estado: EstadoDepreciacionMes =
      primero < esperado ? "generada" : primero > esperado ? "bloqueada" : "pendiente";
    plan.push({
      activo,
      fila: {
        ...base,
        cuota: fila.cuota,
        acumulada: fila.acumulada,
        valorEnLibros: fila.valorEnLibros,
        estado,
        mesPendiente: estado === "bloqueada" ? esperado : null,
      },
    });
  }
  return plan;
}

/** Partida de una sucursal: las cuotas al debe del gasto de cada activo y al haber de su depreciación acumulada. */
export interface PartidaDeDepreciacion {
  sucursalId: string;
  fecha: string;
  concepto: string;
  lineas: LineaPartida[];
  total: string;
  /** Cuota de cada activo incluido, para registrarla */
  cuotas: { activoId: string; cuota: string; acumulada: string }[];
}

/** Agrupa las cuotas pendientes por sucursal y suma las cuentas repetidas en una sola línea. */
export function partidasDeDepreciacion(
  pendientes: readonly PlanActivo[],
  mes: string,
): PartidaDeDepreciacion[] {
  const porSucursal = new Map<string, PlanActivo[]>();
  for (const p of pendientes)
    porSucursal.set(p.activo.sucursalId, [...(porSucursal.get(p.activo.sucursalId) ?? []), p]);

  return [...porSucursal.entries()].map(([sucursalId, planes]) => {
    const gastos = new Map<string, Dinero>();
    const acumuladas = new Map<string, Dinero>();
    for (const { activo, fila } of planes) {
      gastos.set(activo.cuentaGasto.id, (gastos.get(activo.cuentaGasto.id) ?? Dinero.cero()).mas(fila.cuota));
      acumuladas.set(
        activo.cuentaDepreciacion.id,
        (acumuladas.get(activo.cuentaDepreciacion.id) ?? Dinero.cero()).mas(fila.cuota),
      );
    }
    const lineas: LineaPartida[] = [
      ...[...gastos].map(([cuentaId, m]) => ({ cuentaId, debe: m.aTexto(), haber: "0" })),
      ...[...acumuladas].map(([cuentaId, m]) => ({ cuentaId, debe: "0", haber: m.aTexto() })),
    ];
    return {
      sucursalId,
      fecha: ultimoDiaDelMes(primerDiaDelMes(mes)),
      concepto: `Ajuste: depreciación mensual de activos fijos · ${nombreDelMes(mes)}`,
      lineas,
      total: Dinero.sumar([...gastos.values()]).aTexto(),
      cuotas: planes.map(({ activo, fila }) => ({
        activoId: activo.id,
        cuota: fila.cuota,
        acumulada: fila.acumulada,
      })),
    };
  });
}

/** No hay cuotas pendientes en el mes (ya se generó, o ningún activo se deprecia en él). */
export class SinDepreciacionPendienteError extends Error {
  constructor(mes: string) {
    super(`No hay depreciación pendiente en ${nombreDelMes(mes)}.`);
  }
}

/** Hay activos con meses anteriores sin depreciar: se generan en orden. */
export class DepreciacionBloqueadaError extends Error {
  constructor(bloqueados: readonly FilaDepreciacionMes[]) {
    const detalle = bloqueados
      .map((b) => `${b.codigo} (falta ${nombreDelMes(b.mesPendiente ?? "")})`)
      .join(", ");
    super(`Genere primero los meses anteriores de: ${detalle}.`);
  }
}
