import { Inject, Injectable } from "@nestjs/common";
import type { CrearConfiguracionPlanilla } from "@contable/shared";
import { REPOSITORIO_TASAS_PLANILLA, type RepositorioTasasPlanilla } from "../domain/tasas-planilla.js";

@Injectable()
export class CasosTasasPlanilla {
  constructor(@Inject(REPOSITORIO_TASAS_PLANILLA) private readonly repositorio: RepositorioTasasPlanilla) {}

  configuraciones(usuarioId: string, empresaId: string) {
    return this.repositorio.enTransaccion(usuarioId, (unidad) =>
      unidad.configuraciones(usuarioId, empresaId),
    );
  }

  crear(usuarioId: string, empresaId: string, datos: CrearConfiguracionPlanilla) {
    return this.repositorio.enTransaccion(usuarioId, (unidad) => unidad.crear(usuarioId, empresaId, datos));
  }
}
