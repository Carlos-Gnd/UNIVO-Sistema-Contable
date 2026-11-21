export const TEXTOS_ESQUEMA_T = {
  titulo: (codigo: string, nombre: string) => `Mayor · ${codigo} ${nombre}`,
  periodo: (desde: string, hasta: string) => `Del ${desde} al ${hasta}`,
  inicio: "Inicio",
  actualidad: "Actualidad",
  consolidado: "Consolidado",
  exportarPdf: "Exportar PDF",
  esquema: "Esquema T",
  debe: "Debe",
  haber: "Haber",
  saldo: "Saldo",
  saldoInicial: "Saldo inicial",
  suma: "Suma",
  nota: "En el esquema T cada renglón es el número de partida y su monto. Incluye partidas anuladas, nunca borradores.",
  movimientosDe: (lado: string) => `Movimientos de ${lado}`,
  indicadorSaldoContrario: (cantidad: number) =>
    `${cantidad} cuenta${cantidad === 1 ? "" : "s"} tiene${cantidad === 1 ? "" : "n"} saldo contrario a su naturaleza`,
} as const;
