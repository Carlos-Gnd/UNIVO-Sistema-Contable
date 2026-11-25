import { Inject, Injectable } from "@nestjs/common";
import { Dinero, type AntiguedadSaldos, type ConsultaAntiguedad } from "@contable/shared";
import { armarAntiguedad } from "../domain/antiguedad.js";
import { REPOSITORIO_COMERCIAL, type RepositorioComercial } from "../domain/tercero.js";
import { sucursalesVisibles } from "./casos-documento.js";

/**
 * Antigüedad de saldos (HU-63): lo que cada cliente debe o a cada proveedor se le debe, por tramos de atraso al corte.
 * Parte de documentos con partida contabilizada y de abonos y notas contabilizados (nunca borradores) y se compara con
 * el saldo de la cuenta del mayor. El permiso (operaciones.ver) lo exige el controlador.
 */
@Injectable()
export class CasosAntiguedad {
  constructor(@Inject(REPOSITORIO_COMERCIAL) private readonly repositorio: RepositorioComercial) {}

  consultar(usuarioId: string, empresaId: string, consulta: ConsultaAntiguedad): Promise<AntiguedadSaldos> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      const alFecha = consulta.alFecha ?? new Date().toISOString().slice(0, 10);
      const filtro = { operacion: consulta.operacion, alFecha, terceroId: consulta.terceroId, sucursales };
      const saldos = await u.saldosAl(empresaId, filtro);
      const mayor = await u.saldoMayor(empresaId, filtro);
      // Filtrado por cliente o proveedor, la comparación con el mayor completo no tendría sentido: se omite
      return armarAntiguedad(consulta.operacion, alFecha, saldos, {
        codigo: mayor.codigo,
        saldoMayor: consulta.terceroId ? Dinero.sumar(saldos.map((x) => x.saldo)).aTexto() : mayor.saldo,
      });
    });
  }
}
