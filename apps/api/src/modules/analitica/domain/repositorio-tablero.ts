import type { ConsultaTablero, DatosTablero } from "./tablero.js";

export interface RepositorioTablero {
  consultar(usuarioId: string, empresaId: string, consulta: ConsultaTablero): Promise<DatosTablero>;
}

export const REPOSITORIO_TABLERO = Symbol("RepositorioTablero");
