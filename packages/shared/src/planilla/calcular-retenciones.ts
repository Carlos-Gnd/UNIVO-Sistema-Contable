import { Dinero } from "../dinero/dinero";
import type { ConfiguracionPlanillaVista } from "../esquemas/planilla";

export interface RetencionesPlanilla {
  isssLaboral: Dinero;
  isssPatronal: Dinero;
  afpLaboral: Dinero;
  afpPatronal: Dinero;
  renta: Dinero;
  neto: Dinero;
}

/** Calcula aportes y renta mensual con una versión vigente de la configuración de planilla. */
export function calcularRetencionesPlanilla(
  salarioBruto: string,
  configuracion: Pick<
    ConfiguracionPlanillaVista,
    "tasaIsssLaboral" | "tasaIsssPatronal" | "techoIsss" | "tasaAfpLaboral" | "tasaAfpPatronal" | "tramos"
  >,
): RetencionesPlanilla {
  const bruto = Dinero.de(salarioBruto);
  const baseIsss = bruto.mayorQue(configuracion.techoIsss) ? Dinero.de(configuracion.techoIsss) : bruto;
  const isssLaboral = baseIsss.porcentaje(configuracion.tasaIsssLaboral);
  const isssPatronal = baseIsss.porcentaje(configuracion.tasaIsssPatronal);
  const afpLaboral = bruto.porcentaje(configuracion.tasaAfpLaboral);
  const afpPatronal = bruto.porcentaje(configuracion.tasaAfpPatronal);
  // La renta se calcula sobre el salario menos las cotizaciones laborales de ISSS y AFP (como en el ejercicio)
  const baseRenta = bruto.menos(isssLaboral).menos(afpLaboral);
  const tramo = configuracion.tramos.find((t) => t.hasta === null || !baseRenta.mayorQue(t.hasta));
  if (!tramo) throw new Error("La tabla de retención no contiene un tramo aplicable.");
  const renta =
    baseRenta.mayorQue(tramo.desde) || baseRenta.igualA(tramo.desde)
      ? baseRenta.menos(tramo.desde).porcentaje(tramo.porcentaje).mas(tramo.cuotaFija)
      : Dinero.cero();
  const neto = bruto.menos(isssLaboral).menos(afpLaboral).menos(renta);
  return { isssLaboral, isssPatronal, afpLaboral, afpPatronal, renta, neto };
}
