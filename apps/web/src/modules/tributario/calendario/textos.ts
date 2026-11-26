import type { EstadoVencimiento } from "@contable/shared";

/** Textos del calendario tributario (HU-52, S3-T56). */
export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export const ESTADOS: Record<EstadoVencimiento, string> = {
  presentada: "Presentada",
  vencida: "Vencida",
  proxima: "Próxima",
  pendiente: "Pendiente",
};

export const TEXTOS_CALENDARIO = {
  titulo: "Calendario tributario",
  descripcion:
    "Vencimientos del F-07, el F-14 y las planillas de ISSS y AFP, en el día hábil que corresponde",
  aviso:
    "Cada obligación vence el décimo día hábil del mes siguiente al período; no cuentan los fines de semana ni los asuetos. Si Hacienda decreta un asueto extraordinario, la fecha puede correrse.",
  mesAnterior: "Mes anterior",
  mesSiguiente: "Mes siguiente",
  cargando: "Cargando los vencimientos…",
  errorCarga: "No se pudo cargar el calendario.",
  reintentar: "Reintentar",
  hoy: (fecha: string) => `Hoy: ${fecha}`,
  leyenda: { pendiente: "Pendiente", presentada: "Presentada", vencida: "Vencida" },
  dia: (dia: number, mes: string, vencimientos: number) =>
    `${dia} de ${mes}${vencimientos ? `, ${vencimientos} vencimiento${vencimientos === 1 ? "" : "s"}` : ""}`,
  lista: {
    delMes: (mes: string) => `Vencimientos de ${mes}`,
    delDia: (dia: number, mes: string) => `${dia} de ${mes}`,
    verTodo: "Ver todo el mes",
    vacio: "Sin vencimientos en esta fecha.",
    restan: (dias: number) =>
      dias === 0
        ? "vence hoy"
        : dias === 1
          ? "falta 1 día"
          : dias > 1
            ? `faltan ${dias} días`
            : `venció hace ${-dias} días`,
  },
  marcar: {
    presentada: "Marcar como presentada",
    quitar: "Quitar la marca",
    presentadaEl: (fecha: string) => `Presentada el ${fecha}`,
    exito: (titulo: string) => `${titulo}: marcada como presentada`,
    quitada: (titulo: string) => `${titulo}: marca quitada`,
    etiqueta: (titulo: string) => `Marcar ${titulo} como presentada`,
    etiquetaQuitar: (titulo: string) => `Quitar la marca de presentada de ${titulo}`,
  },
  alerta: {
    titulo: "Vencimientos tributarios",
    ninguna: "No hay vencimientos próximos.",
    ver: "Ver el calendario",
    vencida: (titulo: string) => `${titulo}: vencida`,
    proxima: (titulo: string, dias: number) =>
      dias === 0
        ? `${titulo}: vence hoy`
        : dias === 1
          ? `${titulo}: vence mañana`
          : `${titulo}: vence en ${dias} días`,
  },
} as const;
