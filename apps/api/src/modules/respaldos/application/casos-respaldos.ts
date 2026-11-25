import { Inject, Injectable } from "@nestjs/common";
import type { CrearRespaldo, RestaurarRespaldo } from "@contable/shared";
import { REPOSITORIO_RESPALDOS, type RepositorioRespaldos } from "../domain/respaldo.js";

@Injectable()
export class CasosRespaldos {
  constructor(@Inject(REPOSITORIO_RESPALDOS) private readonly repositorio: RepositorioRespaldos) {}

  listar(usuarioId: string, empresaId: string) {
    return this.repositorio.listar(usuarioId, empresaId);
  }

  crear(usuarioId: string, empresaId: string, datos: CrearRespaldo) {
    return this.repositorio.crear(usuarioId, empresaId, datos);
  }

  descargar(usuarioId: string, empresaId: string, respaldoId: string) {
    return this.repositorio.descargar(usuarioId, empresaId, respaldoId);
  }

  restaurar(usuarioId: string, empresaId: string, respaldoId: string, datos: RestaurarRespaldo) {
    return this.repositorio.restaurar(usuarioId, empresaId, respaldoId, datos);
  }
}
