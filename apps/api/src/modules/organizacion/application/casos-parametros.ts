import { Inject, Injectable } from "@nestjs/common";
import {
  PARAMETROS_CON_BLOQUEO,
  type EditarParametros,
  type ParametroConBloqueo,
  type ParametrosEmpresa,
  type ValoresParametros,
} from "@contable/shared";
import { PERMISO_CONFIGURAR_EMPRESA, PERMISO_VER_EMPRESA, ReglaEmpresaError } from "../domain/empresa.js";
import { REPOSITORIO_EMPRESAS, type RepositorioEmpresas } from "../domain/repositorio-empresas.js";
import { empresaConPermiso } from "./casos-empresa.js";

/** Nombre de cada parámetro bloqueable en los mensajes al usuario. */
const NOMBRE_PARAMETRO: Record<ParametroConBloqueo, string> = {
  modoNumeracion: "la numeración de partidas",
  metodoValuacion: "el método de valuación",
  sistemaInventario: "el sistema de inventario",
};

/** "a", "a y b", "a, b y c" */
function enumerar(partes: string[]): string {
  return partes.length < 2 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

function conBloqueo(valores: ValoresParametros, tieneMovimientos: boolean): ParametrosEmpresa {
  return { ...valores, tieneMovimientos, bloqueados: tieneMovimientos ? [...PARAMETROS_CON_BLOQUEO] : [] };
}

/** Consultar los parámetros contables de la empresa y cuáles están bloqueados (HU-12, S2-T02). */
@Injectable()
export class ConsultarParametros {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(usuarioId: string, empresaId: string): Promise<ParametrosEmpresa> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await empresaConPermiso(unidad, usuarioId, empresaId, PERMISO_VER_EMPRESA, "ver la empresa");
      return conBloqueo(
        await unidad.parametros(empresaId),
        await unidad.tienePartidasContabilizadas(empresaId),
      );
    });
  }
}

/**
 * Cambiar los parámetros contables de la empresa (HU-12, S2-T02); requiere empresa.configurar. Con
 * movimientos no se cambian la numeración, el método de valuación ni el sistema de inventario: las partidas
 * ya registradas se calcularon con ellos. Volver a enviar el mismo valor no cuenta como cambio. El cambio
 * queda en la bitácora a nombre del usuario (la transacción lo identifica ante el trigger de auditoría).
 */
@Injectable()
export class EditarParametrosCaso {
  constructor(@Inject(REPOSITORIO_EMPRESAS) private readonly repositorio: RepositorioEmpresas) {}

  ejecutar(usuarioId: string, empresaId: string, cambios: EditarParametros): Promise<ParametrosEmpresa> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await empresaConPermiso(
        unidad,
        usuarioId,
        empresaId,
        PERMISO_CONFIGURAR_EMPRESA,
        "configurar los parámetros",
      );
      const actuales = await unidad.parametros(empresaId);
      const tieneMovimientos = await unidad.tienePartidasContabilizadas(empresaId);

      const cambiados = PARAMETROS_CON_BLOQUEO.filter(
        (p) => cambios[p] !== undefined && cambios[p] !== actuales[p],
      );
      if (tieneMovimientos && cambiados.length > 0) {
        const nombres = enumerar(cambiados.map((p) => NOMBRE_PARAMETRO[p]));
        throw new ReglaEmpresaError(
          `La empresa ya tiene partidas contabilizadas: no se puede cambiar ${nombres}.`,
        );
      }
      return conBloqueo(await unidad.actualizarParametros(empresaId, cambios), tieneMovimientos);
    });
  }
}
