import { Inject, Injectable } from "@nestjs/common";
import {
  calcularProyeccion,
  type ProyeccionFinanciera,
  type SupuestosProyeccion,
} from "../domain/proyecciones.js";
import {
  REPOSITORIO_PROYECCIONES,
  type RepositorioProyecciones,
} from "../domain/repositorio-proyecciones.js";

@Injectable()
export class ProyectarEstados {
  constructor(@Inject(REPOSITORIO_PROYECCIONES) private readonly repositorio: RepositorioProyecciones) {}

  async ejecutar(
    usuarioId: string,
    empresaId: string,
    supuestos: SupuestosProyeccion,
  ): Promise<ProyeccionFinanciera> {
    const historial = await this.repositorio.historial(usuarioId, empresaId);
    return calcularProyeccion(historial, supuestos);
  }
}
