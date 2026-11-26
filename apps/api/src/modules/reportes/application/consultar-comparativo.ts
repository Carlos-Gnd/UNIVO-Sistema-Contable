import { Injectable } from "@nestjs/common";
import type { ConsultaComparativo, EstadoComparativo } from "@contable/shared";
import { compararBalances, compararResultados } from "../domain/comparativo.js";
import { ConsultarBalanceGeneral, ConsultarEstadoResultados } from "./consultar-estados.js";

/**
 * Caso de uso: estado comparativo de dos períodos con variación absoluta y porcentual (HU-43, S3-T28). Pide
 * cada período al mismo caso de uso del estado simple, así que respeta sus permisos, su alcance por sucursal
 * y su formato, y las cifras son las mismas que el usuario ve en cada estado por separado.
 */
@Injectable()
export class ConsultarComparativo {
  constructor(
    private readonly resultados: ConsultarEstadoResultados,
    private readonly balances: ConsultarBalanceGeneral,
  ) {}

  async ejecutar(
    usuarioId: string,
    empresaId: string,
    consulta: ConsultaComparativo,
  ): Promise<EstadoComparativo> {
    const comun = {
      ...(consulta.sucursalId ? { sucursalId: consulta.sucursalId } : {}),
      ...(consulta.formato ? { formato: consulta.formato } : {}),
    };
    if (consulta.estado === "balance-general") {
      const [a, b] = await Promise.all([
        this.balances.ejecutar(usuarioId, empresaId, { fecha: consulta.hastaA, ...comun }),
        this.balances.ejecutar(usuarioId, empresaId, { fecha: consulta.hastaB, ...comun }),
      ]);
      return compararBalances(a, b);
    }
    const periodo = (desde: string | undefined, hasta: string) => ({
      desde: desde ?? hasta,
      hasta,
      ...comun,
    });
    const [a, b] = await Promise.all([
      this.resultados.ejecutar(usuarioId, empresaId, periodo(consulta.desdeA, consulta.hastaA)),
      this.resultados.ejecutar(usuarioId, empresaId, periodo(consulta.desdeB, consulta.hastaB)),
    ]);
    return compararResultados(a, b);
  }
}
