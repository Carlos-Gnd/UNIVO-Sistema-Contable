/** Textos del libro mayor (HU-27, S2-T22 y S2-T23). */
export const TEXTOS_LIBRO_MAYOR = {
  titulo: "Libro mayor",
  descripcion:
    "Movimientos de una cuenta con su saldo acumulado. Una cuenta de mayor incluye sus subcuentas.",
  cuenta: "Cuenta",
  elegirCuenta: "Elige una cuenta…",
  sinCuenta: "Elige una cuenta para ver su libro mayor.",
  naturaleza: { deudora: "Naturaleza deudora", acreedora: "Naturaleza acreedora" },
  columnas: {
    fecha: "Fecha",
    partida: "Partida",
    concepto: "Concepto",
    subcuenta: "Subcuenta",
    sucursal: "Sucursal",
    debe: "Debe",
    haber: "Haber",
    saldo: "Saldo",
  },
  saldoInicial: "Saldo inicial",
  totales: "Totales y saldo final",
  numero: (n: number) => `n.º ${n}`,
  sinConcepto: "Sin concepto",
  vacio: "La cuenta no tiene movimientos en el período.",
  exportar: {
    excel: "Exportar Excel",
    pdf: "Exportar PDF",
    generando: "Generando…",
    error: "No se pudo generar el archivo.",
    ventanaBloqueada:
      "El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.",
    hoja: "Libro mayor",
    archivo: (codigo: string, fecha: string) => `libro-mayor-${codigo}-${fecha}.xlsx`,
    generado: (fecha: string) => `Generado el ${fecha}`,
  },
} as const;
