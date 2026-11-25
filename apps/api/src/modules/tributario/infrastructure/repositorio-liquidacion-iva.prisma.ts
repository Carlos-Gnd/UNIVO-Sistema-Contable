import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import {
  calcularLiquidacionIva,
  CUENTAS_LIQUIDACION_IVA,
  Dinero,
  encadenarLiquidaciones,
  REMANENTE_CERO,
  type ClasificacionContribuyente,
  type DeclaracionLiquidacionIvaVista,
  type EstadoPartidaLiquidacionIva,
  type LineaPartidaLiquidacionIva,
  type LiquidacionIvaVista,
  type RetencionPercepcionVista,
  type ResultadoLiquidacionIva,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  cifrasPorMes,
  ConflictoLiquidacionIvaError,
  LiquidacionIvaNoEncontradaError,
  ReglaLiquidacionIvaError,
  type AccesoLiquidacionIva,
  type CifrasMesLibros,
  type FilaAgregadaIva,
  type RepositorioLiquidacionIva,
  type UnidadLiquidacionIva,
} from "../domain/liquidacion-iva.js";
import { armarRetencionesPercepciones } from "../domain/retencion-percepcion.js";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const dos = (n: number) => String(n).padStart(2, "0");
const inicioMes = (anio: number, mes: number) => `${anio}-${dos(mes)}-01`;
const finMes = (anio: number, mes: number) =>
  `${anio}-${dos(mes)}-${dos(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`;

function esDuplicado(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

interface FilaSql {
  mes: string;
  operacion: FilaAgregadaIva["operacion"];
  tipo_documento: FilaAgregadaIva["tipoDocumento"];
  iva: string;
  iva_percibido: string;
  iva_retenido: string;
}

interface FilaUnoPorCientoSql {
  id: string;
  fecha: string;
  tipo_documento: "ccf" | "factura" | "exportacion";
  numero_documento: string;
  operacion: "compra" | "venta";
  tercero: string | null;
  clasificacion_tercero: ClasificacionContribuyente;
  total_gravado: string;
  iva_percibido: string;
  iva_retenido: string;
  anulado: boolean;
}

interface CuentaLiquidacion {
  id: string;
  nombre: string;
}

class UnidadPrisma implements UnidadLiquidacionIva {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoLiquidacionIva | null> {
    const [fila] = await this.tx.$queryRaw<{ todas_sucursales: boolean; permisos: string[] }[]>`
      SELECT m.todas_sucursales,
             ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                   WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id) AS permisos
      FROM membresias m
      JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      JOIN empresas e ON e.id = m.empresa_id AND e.activa
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    return fila ? { permisos: new Set(fila.permisos), todasSucursales: fila.todas_sucursales } : null;
  }

  /**
   * Suma por mes de los documentos cuya partida está contabilizada, hasta el fin del mes consultado. Un documento
   * con la partida anulada ya no cuenta (en los libros de IVA aparece, pero en cero). Los borradores no entran.
   * Las notas de crédito y de débito (HU-61) entran en el mes en que se emiten, con el tipo del documento que
   * corrigen: la de crédito resta (signo negativo) y la de débito suma, como en los libros.
   */
  private async agregados(empresaId: string, anio: number, mes: number): Promise<FilaAgregadaIva[]> {
    const filas = await this.tx.$queryRaw<FilaSql[]>`
      SELECT mes, operacion, tipo_documento,
             SUM(iva)::text AS iva, SUM(iva_percibido)::text AS iva_percibido, SUM(iva_retenido)::text AS iva_retenido
      FROM (
        SELECT to_char(date_trunc('month', d.fecha), 'YYYY-MM') AS mes,
               d.operacion::text AS operacion, d.tipo_documento::text AS tipo_documento,
               d.iva, d.iva_percibido, d.iva_retenido
        FROM documentos_comerciales d
        JOIN partidas p ON p.id = d.partida_id
        WHERE d.empresa_id = ${empresaId}::uuid
          AND p.estado = 'contabilizada'
          AND d.fecha <= ${finMes(anio, mes)}::date
        UNION ALL
        SELECT to_char(date_trunc('month', n.fecha), 'YYYY-MM'),
               n.operacion::text, d.tipo_documento::text,
               CASE n.tipo WHEN 'credito' THEN -n.iva ELSE n.iva END,
               CASE n.tipo WHEN 'credito' THEN -n.iva_percibido ELSE n.iva_percibido END,
               CASE n.tipo WHEN 'credito' THEN -n.iva_retenido ELSE n.iva_retenido END
        FROM notas_comerciales n
        JOIN documentos_comerciales d ON d.id = n.documento_id AND d.empresa_id = n.empresa_id
        JOIN partidas pn ON pn.id = n.partida_id
        WHERE n.empresa_id = ${empresaId}::uuid
          AND pn.estado = 'contabilizada'
          AND n.fecha <= ${finMes(anio, mes)}::date
      ) m
      GROUP BY 1, 2, 3`;
    return filas.map((f) => ({
      mes: f.mes,
      operacion: f.operacion,
      tipoDocumento: f.tipo_documento,
      iva: f.iva,
      ivaPercibido: f.iva_percibido,
      ivaRetenido: f.iva_retenido,
    }));
  }

  /** Liquida los meses en cadena, para que cada remanente llegue al mes siguiente, y devuelve el del mes pedido. */
  private async calcular(
    empresaId: string,
    anio: number,
    mes: number,
  ): Promise<{ cifras: CifrasMesLibros; resultado: ResultadoLiquidacionIva }> {
    const mesFinal = `${anio}-${dos(mes)}`;
    const meses = cifrasPorMes(await this.agregados(empresaId, anio, mes), mesFinal);
    const ultimo = meses.at(-1);
    if (!ultimo) {
      // Sin documentos hasta ese mes: no hay nada que liquidar ni remanente que trasladar
      const sinMovimiento: CifrasMesLibros = {
        debitoContribuyentes: "0.00",
        debitoConsumidorFinal: "0.00",
        debitoFiscal: "0.00",
        creditoFiscal: "0.00",
        percibidoSufrido: "0.00",
        retenidoSufrido: "0.00",
        percibidoEfectuado: "0.00",
        retenidoEfectuado: "0.00",
      };
      return {
        cifras: sinMovimiento,
        resultado: calcularLiquidacionIva({ ...sinMovimiento, remanenteAnterior: REMANENTE_CERO }),
      };
    }
    return { cifras: ultimo.cifras, resultado: encadenarLiquidaciones(meses.map((m) => m.cifras)).at(-1)! };
  }

  private async cuentas(empresaId: string): Promise<Map<string, CuentaLiquidacion>> {
    const filas = await this.tx.cuenta.findMany({
      where: { empresaId, activa: true, codigo: { in: Object.values(CUENTAS_LIQUIDACION_IVA) } },
      select: { id: true, codigo: true, nombre: true },
    });
    return new Map(filas.map((f) => [f.codigo, { id: f.id, nombre: f.nombre }]));
  }

  /** Partida de liquidación: el débito fiscal se salda contra los créditos usados y, lo que sobre, IVA por pagar. */
  private lineas(resultado: ResultadoLiquidacionIva, cuentas: Map<string, CuentaLiquidacion>) {
    const C = CUENTAS_LIQUIDACION_IVA;
    const candidatas: [string, string, string, string][] = [
      [C.debitoFiscal, "IVA Débito Fiscal", resultado.debitoFiscal, "debe"],
      [C.creditoFiscal, "Crédito Fiscal IVA", resultado.usoCredito, "haber"],
      [C.ivaPercibidoSufrido, "IVA Percibido", resultado.usoPercibido, "haber"],
      [C.ivaRetenidoSufrido, "IVA Retenido", resultado.usoRetenido, "haber"],
      [C.ivaPorPagar, "Impuestos por Pagar · IVA", resultado.ivaPorPagar, "haber"],
    ];
    const lineas = candidatas
      .filter(([, , monto]) => !Dinero.de(monto).esCero())
      .map(([codigo, nombre, monto, lado]) => ({
        codigo,
        cuenta: cuentas.get(codigo),
        vista: {
          codigo,
          nombre: cuentas.get(codigo)?.nombre ?? nombre,
          debe: lado === "debe" ? monto : "0.00",
          haber: lado === "haber" ? monto : "0.00",
        } satisfies LineaPartidaLiquidacionIva,
      }));
    return lineas;
  }

  private async declaracion(
    empresaId: string,
    anio: number,
    mes: number,
    resultado: ResultadoLiquidacionIva,
  ): Promise<DeclaracionLiquidacionIvaVista | null> {
    const fila = await this.tx.liquidacionIva.findUnique({
      where: { empresaId_periodo: { empresaId, periodo: new Date(`${inicioMes(anio, mes)}T00:00:00Z`) } },
      include: { partida: { select: { estado: true, numero: true } } },
    });
    if (!fila) return null;
    const igual = (a: { toFixed(n: number): string }, b: string) => Dinero.de(a.toFixed(2)).igualA(b);
    return {
      id: fila.id,
      partidaId: fila.partidaId,
      estadoPartida: fila.partida.estado as EstadoPartidaLiquidacionIva,
      numeroPartida: fila.partida.numero,
      debitoFiscal: fila.debitoFiscal.toFixed(2),
      ivaPorPagar: fila.ivaPorPagar.toFixed(2),
      remanenteTotal: Dinero.sumar([
        fila.remanenteCredito.toFixed(2),
        fila.remanentePercibido.toFixed(2),
        fila.remanenteRetenido.toFixed(2),
      ]).aTexto(),
      presentadaEn: fila.presentadaEn?.toISOString() ?? null,
      desactualizada:
        !igual(fila.debitoFiscal, resultado.debitoFiscal) ||
        !igual(fila.creditoFiscal, resultado.creditoFiscal) ||
        !igual(fila.percibidoSufrido, resultado.percibidoSufrido) ||
        !igual(fila.retenidoSufrido, resultado.retenidoSufrido) ||
        !igual(fila.remanenteAnterior, sumaRemanente(resultado.remanenteAnterior)) ||
        !igual(fila.ivaPorPagar, resultado.ivaPorPagar),
    };
  }

  private async periodoAbierto(empresaId: string, anio: number, mes: number): Promise<boolean> {
    const [fila] = await this.tx.$queryRaw<{ estado: string }[]>`
      SELECT estado::text FROM periodos
      WHERE empresa_id = ${empresaId}::uuid AND fecha_inicio = ${inicioMes(anio, mes)}::date`;
    return fila?.estado === "abierto";
  }

  async consultar(empresaId: string, anio: number, mes: number): Promise<LiquidacionIvaVista> {
    const { cifras, resultado } = await this.calcular(empresaId, anio, mes);
    const lineas = this.lineas(resultado, await this.cuentas(empresaId));
    return {
      anio,
      mes,
      fechaPartida: finMes(anio, mes),
      debitoContribuyentes: cifras.debitoContribuyentes,
      debitoConsumidorFinal: cifras.debitoConsumidorFinal,
      debitoFiscal: resultado.debitoFiscal,
      creditoFiscal: resultado.creditoFiscal,
      percibidoSufrido: resultado.percibidoSufrido,
      retenidoSufrido: resultado.retenidoSufrido,
      remanenteAnterior: resultado.remanenteAnterior,
      remanenteAnteriorTotal: sumaRemanente(resultado.remanenteAnterior),
      ivaPorPagar: resultado.ivaPorPagar,
      remanente: resultado.remanente,
      remanenteTotal: resultado.remanenteTotal,
      percibidoEfectuado: cifras.percibidoEfectuado,
      retenidoEfectuado: cifras.retenidoEfectuado,
      totalAEnterar: Dinero.sumar([
        resultado.ivaPorPagar,
        cifras.percibidoEfectuado,
        cifras.retenidoEfectuado,
      ]).aTexto(),
      lineasPartida: lineas.map((l) => l.vista),
      declaracion: await this.declaracion(empresaId, anio, mes, resultado),
      periodoAbierto: await this.periodoAbierto(empresaId, anio, mes),
    };
  }

  async generarPartida(empresaId: string, anio: number, mes: number): Promise<LiquidacionIvaVista> {
    const { resultado } = await this.calcular(empresaId, anio, mes);
    if (Dinero.de(resultado.debitoFiscal).esCero()) {
      throw new ReglaLiquidacionIvaError(
        `No hay débito fiscal contabilizado en ${MESES[mes - 1]} de ${anio}: no hay IVA que liquidar.`,
      );
    }
    const lineas = this.lineas(resultado, await this.cuentas(empresaId));
    const faltante = lineas.find((l) => !l.cuenta);
    if (faltante) {
      throw new ReglaLiquidacionIvaError(
        `Falta la cuenta ${faltante.codigo} (${faltante.vista.nombre}) para liquidar el IVA.`,
      );
    }
    const matriz = await this.tx.sucursal.findFirst({
      where: { empresaId, esMatriz: true, activa: true },
      select: { id: true },
    });
    if (!matriz) {
      throw new ReglaLiquidacionIvaError("La empresa no tiene una casa matriz activa para la partida.");
    }

    const periodo = new Date(`${inicioMes(anio, mes)}T00:00:00Z`);
    const existente = await this.tx.liquidacionIva.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
      include: { partida: { select: { estado: true } } },
    });
    if (existente && (existente.presentadaEn || existente.partida.estado !== "anulada")) {
      throw new ConflictoLiquidacionIvaError(
        existente.presentadaEn
          ? "El F-07 de ese mes ya fue presentado."
          : "Ya existe una partida de liquidación del IVA de ese mes; anúlela si necesita generarla de nuevo.",
      );
    }

    // La partida apunta a la liquidación (origen_id); el trigger de la base lo exige.
    const liquidacionId = existente?.id ?? randomUUID();
    try {
      const partida = await this.tx.partida.create({
        data: {
          empresaId,
          sucursalId: matriz.id,
          fecha: new Date(`${finMes(anio, mes)}T00:00:00Z`),
          tipo: "ajuste",
          concepto: `Ajuste: liquidación del IVA de ${MESES[mes - 1]} ${anio} (F-07)`,
          origen: "liquidacion_iva",
          origenId: liquidacionId,
          detalles: {
            create: lineas.map((l, orden) => ({
              empresaId,
              cuentaId: l.cuenta!.id,
              debe: l.vista.debe,
              haber: l.vista.haber,
              orden,
            })),
          },
        },
        select: { id: true },
      });
      const datos = {
        debitoFiscal: resultado.debitoFiscal,
        creditoFiscal: resultado.creditoFiscal,
        percibidoSufrido: resultado.percibidoSufrido,
        retenidoSufrido: resultado.retenidoSufrido,
        remanenteAnterior: sumaRemanente(resultado.remanenteAnterior),
        ivaPorPagar: resultado.ivaPorPagar,
        remanenteCredito: resultado.remanente.credito,
        remanentePercibido: resultado.remanente.percibido,
        remanenteRetenido: resultado.remanente.retenido,
        partidaId: partida.id,
      };
      if (existente) await this.tx.liquidacionIva.update({ where: { id: existente.id }, data: datos });
      else await this.tx.liquidacionIva.create({ data: { id: liquidacionId, empresaId, periodo, ...datos } });
    } catch (error) {
      if (esDuplicado(error)) {
        throw new ConflictoLiquidacionIvaError("Ya existe una partida de liquidación del IVA de ese mes.");
      }
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaLiquidacionIvaError(regla);
      throw error;
    }
    return this.consultar(empresaId, anio, mes);
  }

  async retencionesDelMes(empresaId: string, anio: number, mes: number): Promise<RetencionPercepcionVista> {
    const filas = await this.tx.$queryRaw<FilaUnoPorCientoSql[]>`
      SELECT d.id::text AS id, to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.tipo_documento::text AS tipo_documento,
             d.numero_documento, d.operacion::text AS operacion, t.nombre AS tercero,
             COALESCE(t.clasificacion::text, 'otro') AS clasificacion_tercero,
             d.total_gravado::text AS total_gravado, d.iva_percibido::text AS iva_percibido,
             d.iva_retenido::text AS iva_retenido, (p.estado = 'anulada') AS anulado
      FROM documentos_comerciales d
      JOIN partidas p ON p.id = d.partida_id
      LEFT JOIN terceros t ON t.id = d.tercero_id AND t.empresa_id = d.empresa_id
      WHERE d.empresa_id = ${empresaId}::uuid
        AND p.estado IN ('contabilizada', 'anulada')
        AND d.fecha BETWEEN ${inicioMes(anio, mes)}::date AND ${finMes(anio, mes)}::date
        AND (d.iva_percibido > 0 OR d.iva_retenido > 0)`;
    const empresa = await this.tx.empresa.findUnique({
      where: { id: empresaId },
      select: { clasificacion: true },
    });
    return armarRetencionesPercepciones(
      anio,
      mes,
      empresa?.clasificacion ?? "otro",
      filas.map((f) => ({
        id: f.id,
        fecha: f.fecha,
        tipoDocumento: f.tipo_documento,
        numeroDocumento: f.numero_documento,
        operacion: f.operacion,
        tercero: f.tercero,
        clasificacionTercero: f.clasificacion_tercero,
        totalGravado: f.total_gravado,
        ivaPercibido: f.iva_percibido,
        ivaRetenido: f.iva_retenido,
        anulado: f.anulado,
      })),
    );
  }

  async presentar(
    usuarioId: string,
    empresaId: string,
    anio: number,
    mes: number,
  ): Promise<LiquidacionIvaVista> {
    const periodo = new Date(`${inicioMes(anio, mes)}T00:00:00Z`);
    const fila = await this.tx.liquidacionIva.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
      include: { partida: { select: { estado: true } } },
    });
    if (!fila) throw new LiquidacionIvaNoEncontradaError();
    if (fila.presentadaEn) return this.consultar(empresaId, anio, mes);
    if (fila.partida.estado !== "contabilizada") {
      throw new ReglaLiquidacionIvaError(
        "Contabilice la partida de liquidación antes de marcar el F-07 como presentado.",
      );
    }
    try {
      await this.tx.liquidacionIva.update({
        where: { id: fila.id },
        data: { presentadaPor: usuarioId, presentadaEn: new Date() },
      });
    } catch (error) {
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaLiquidacionIvaError(regla);
      throw error;
    }
    return this.consultar(empresaId, anio, mes);
  }
}

const sumaRemanente = (r: { credito: string; percibido: string; retenido: string }) =>
  Dinero.sumar([r.credito, r.percibido, r.retenido]).aTexto();

@Injectable()
export class RepositorioLiquidacionIvaPrisma implements RepositorioLiquidacionIva {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadLiquidacionIva) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
