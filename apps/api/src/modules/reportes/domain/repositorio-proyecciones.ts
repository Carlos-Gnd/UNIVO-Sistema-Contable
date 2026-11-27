import type { MesHistoricoProyeccion } from "./proyecciones.js";

export interface RepositorioProyecciones {
  historial(usuarioId: string, empresaId: string): Promise<MesHistoricoProyeccion[]>;
}

export const REPOSITORIO_PROYECCIONES = Symbol("RepositorioProyecciones");
