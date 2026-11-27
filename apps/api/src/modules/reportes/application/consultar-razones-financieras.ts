import { Injectable } from "@nestjs/common";
import type { ConsultaBalanza, RazonesFinancieras } from "@contable/shared";
import { ConsultarBalanceGeneral, ConsultarEstadoResultados } from "./consultar-estados.js";
import { calcularRazonesFinancieras } from "../domain/razones-financieras.js";

/** Obtiene los estados autorizados del período y calcula sus razones financieras (HU-84, S4-T22). */
@Injectable()
export class ConsultarRazonesFinancieras {
  constructor(
    private readonly estadoResultados: ConsultarEstadoResultados,
    private readonly balanceGeneral: ConsultarBalanceGeneral,
  ) {}

  async ejecutar(
    usuarioId: string,
    empresaId: string,
    consulta: ConsultaBalanza,
  ): Promise<RazonesFinancieras> {
    const [estado, balance] = await Promise.all([
      this.estadoResultados.ejecutar(usuarioId, empresaId, consulta),
      this.balanceGeneral.ejecutar(usuarioId, empresaId, {
        fecha: consulta.hasta,
        sucursalId: consulta.sucursalId,
      }),
    ]);
    return calcularRazonesFinancieras(estado, balance);
  }
}
