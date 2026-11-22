/** Textos del balance general (HU-38, S2-T47). */
export const TEXTOS_BALANCE = {
  titulo: "Balance general",
  descripcion:
    "Activo, pasivo y patrimonio a una fecha: el activo debe ser igual al pasivo más el patrimonio.",
  fecha: "Al",
  fechaRequerida: "Escribe la fecha del balance.",
  alFecha: (fecha: string) => `Al ${fecha}`,
  activo: "Activo",
  pasivoPatrimonio: "Pasivo y patrimonio",
  totalActivo: "Total activo",
  totalPasivo: "Total pasivo",
  totalPasivoPatrimonio: "Total pasivo más patrimonio",
  sinCuentas: "Sin saldos",
  calculado: "Calculado",
  cuadre: "Activo y pasivo más patrimonio",
} as const;
