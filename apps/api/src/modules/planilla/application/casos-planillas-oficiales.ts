import { Inject, Injectable } from "@nestjs/common";
import type { PresentarPlanillaOficial } from "@contable/shared";
import {
  REPOSITORIO_PLANILLAS_OFICIALES,
  type RepositorioPlanillasOficiales,
} from "../domain/planillas-oficiales.js";

@Injectable()
export class CasosPlanillasOficiales {
  constructor(
    @Inject(REPOSITORIO_PLANILLAS_OFICIALES)
    private readonly repositorio: RepositorioPlanillasOficiales,
  ) {}

  consultar(usuarioId: string, empresaId: string, periodo: string) {
    return this.repositorio.consultar(usuarioId, empresaId, periodo);
  }

  presentar(usuarioId: string, empresaId: string, datos: PresentarPlanillaOficial) {
    return this.repositorio.presentar(usuarioId, empresaId, datos);
  }
}
