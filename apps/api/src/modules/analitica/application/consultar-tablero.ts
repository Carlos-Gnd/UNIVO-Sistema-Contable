import { Inject, Injectable } from "@nestjs/common";
import { REPOSITORIO_TABLERO, type RepositorioTablero } from "../domain/repositorio-tablero.js";
import { armarTablero, type ConsultaTablero, type TableroIndicadores } from "../domain/tablero.js";

@Injectable()
export class ConsultarTablero {
  constructor(@Inject(REPOSITORIO_TABLERO) private readonly repositorio: RepositorioTablero) {}

  async ejecutar(
    usuarioId: string,
    empresaId: string,
    consulta: ConsultaTablero,
  ): Promise<TableroIndicadores> {
    return armarTablero(await this.repositorio.consultar(usuarioId, empresaId, consulta));
  }
}
