import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import {
  calcularPagoACuenta,
  CUENTAS_PAGO_A_CUENTA,
  Dinero,
  TASA_PAGO_A_CUENTA,
  type DeclaracionPagoACuentaVista,
  type EstadoPartidaPagoACuenta,
  type LineaPartidaPagoACuenta,
  type PagoACuentaVista,
  type PagosACuentaEjercicioVista,
  type ResultadoPagoACuenta,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  ConflictoPagoACuentaError,
  PagoACuentaNoEncontradoError,
  ReglaPagoACuentaError,
  type AccesoPagoACuenta,
  type RepositorioPagoACuenta,
  type UnidadPagoACuenta,
} from "../domain/pago-a-cuenta.js";

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

class UnidadPrisma implements UnidadPagoACuenta {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoPagoACuenta | null> {
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
   * Ingresos brutos del mes: movimiento acreedor neto de las ventas (5101 y subcuentas) en partidas contabilizadas
   * y anuladas (la reversión compensa la anulada). Se excluyen las partidas de cierre, que liquidan los ingresos.
   */
  private async ingresosBrutos(empresaId: string, anio: number, mes: number): Promise<Dinero> {
    const [fila] = await this.tx.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(d.haber - d.debe), 0)::text AS total
      FROM partida_detalles d
      JOIN partidas p ON p.id = d.partida_id
      JOIN cuentas c ON c.id = d.cuenta_id
      WHERE p.empresa_id = ${empresaId}::uuid
        AND p.estado IN ('contabilizada', 'anulada') AND p.tipo <> 'cierre'
        AND p.fecha BETWEEN ${inicioMes(anio, mes)}::date AND ${finMes(anio, mes)}::date
        AND c.codigo LIKE ${CUENTAS_PAGO_A_CUENTA.ingresos + "%"}`;
    return Dinero.de(fila?.total ?? "0");
  }

  /**
   * Renta retenida del mes: créditos a la cuenta 210604 en partidas contabilizadas. Las de planilla (origen
   * «planilla», las que genera el cálculo de planilla) se separan de las demás, que son retenciones por servicios.
   * Una partida anulada y su reversión se excluyen juntas; los pagos de retenciones (débitos) no restan.
   */
  private async retenciones(
    empresaId: string,
    anio: number,
    mes: number,
  ): Promise<{ planilla: Dinero; servicios: Dinero }> {
    const [fila] = await this.tx.$queryRaw<{ planilla: string; servicios: string }[]>`
      SELECT COALESCE(SUM(d.haber) FILTER (WHERE p.origen = 'planilla'), 0)::text AS planilla,
             COALESCE(SUM(d.haber) FILTER (WHERE p.origen <> 'planilla'), 0)::text AS servicios
      FROM partida_detalles d
      JOIN partidas p ON p.id = d.partida_id
      JOIN cuentas c ON c.id = d.cuenta_id
      WHERE p.empresa_id = ${empresaId}::uuid
        AND p.estado = 'contabilizada' AND p.tipo NOT IN ('reversion', 'cierre')
        AND p.fecha BETWEEN ${inicioMes(anio, mes)}::date AND ${finMes(anio, mes)}::date
        AND c.codigo LIKE ${CUENTAS_PAGO_A_CUENTA.retencionesRenta + "%"}`;
    return { planilla: Dinero.de(fila?.planilla ?? "0"), servicios: Dinero.de(fila?.servicios ?? "0") };
  }

  private async cuentas(empresaId: string): Promise<Map<string, { id: string; nombre: string }>> {
    const filas = await this.tx.cuenta.findMany({
      where: {
        empresaId,
        activa: true,
        codigo: { in: [CUENTAS_PAGO_A_CUENTA.pagoACuentaActivo, CUENTAS_PAGO_A_CUENTA.pagoACuentaPasivo] },
      },
      select: { id: true, codigo: true, nombre: true },
    });
    return new Map(filas.map((f) => [f.codigo, { id: f.id, nombre: f.nombre }]));
  }

  private lineas(calculo: ResultadoPagoACuenta, cuentas: Map<string, { id: string; nombre: string }>) {
    const activo = cuentas.get(CUENTAS_PAGO_A_CUENTA.pagoACuentaActivo);
    const pasivo = cuentas.get(CUENTAS_PAGO_A_CUENTA.pagoACuentaPasivo);
    const vista: LineaPartidaPagoACuenta[] = [
      {
        codigo: CUENTAS_PAGO_A_CUENTA.pagoACuentaActivo,
        nombre: `${activo?.nombre ?? "Pago a Cuenta"} (activo)`,
        debe: calculo.pagoACuenta,
        haber: "0.00",
      },
      {
        codigo: CUENTAS_PAGO_A_CUENTA.pagoACuentaPasivo,
        nombre: `${pasivo?.nombre ?? "Pago a Cuenta"} (por pagar)`,
        debe: "0.00",
        haber: calculo.pagoACuenta,
      },
    ];
    return { activo, pasivo, vista };
  }

  private async calcular(empresaId: string, anio: number, mes: number): Promise<ResultadoPagoACuenta> {
    const [ingresos, retenciones] = await Promise.all([
      this.ingresosBrutos(empresaId, anio, mes),
      this.retenciones(empresaId, anio, mes),
    ]);
    return calcularPagoACuenta({
      ingresosBrutos: ingresos.aTexto(),
      retencionesPlanilla: retenciones.planilla.aTexto(),
      retencionesServicios: retenciones.servicios.aTexto(),
    });
  }

  private async declaracion(
    empresaId: string,
    anio: number,
    mes: number,
    calculo: ResultadoPagoACuenta,
  ): Promise<DeclaracionPagoACuentaVista | null> {
    const fila = await this.tx.pagoACuenta.findUnique({
      where: { empresaId_periodo: { empresaId, periodo: new Date(`${inicioMes(anio, mes)}T00:00:00Z`) } },
      include: { partida: { select: { estado: true, numero: true } } },
    });
    if (!fila) return null;
    const igual = (a: { toFixed(n: number): string }, b: string) => Dinero.de(a.toFixed(2)).igualA(b);
    return {
      id: fila.id,
      partidaId: fila.partidaId,
      estadoPartida: fila.partida.estado as EstadoPartidaPagoACuenta,
      numeroPartida: fila.partida.numero,
      tasa: fila.tasa.toFixed(2),
      ingresosBrutos: fila.ingresosBrutos.toFixed(2),
      pagoACuenta: fila.pagoACuenta.toFixed(2),
      retencionesPlanilla: fila.retencionesPlanilla.toFixed(2),
      retencionesServicios: fila.retencionesServicios.toFixed(2),
      presentadaEn: fila.presentadaEn?.toISOString() ?? null,
      desactualizada:
        !igual(fila.ingresosBrutos, calculo.ingresosBrutos) ||
        !igual(fila.retencionesPlanilla, calculo.retencionesPlanilla) ||
        !igual(fila.retencionesServicios, calculo.retencionesServicios),
    };
  }

  private async periodoAbierto(empresaId: string, anio: number, mes: number): Promise<boolean> {
    const [fila] = await this.tx.$queryRaw<{ estado: string }[]>`
      SELECT estado::text FROM periodos
      WHERE empresa_id = ${empresaId}::uuid AND fecha_inicio = ${inicioMes(anio, mes)}::date`;
    return fila?.estado === "abierto";
  }

  async consultar(empresaId: string, anio: number, mes: number): Promise<PagoACuentaVista> {
    const calculo = await this.calcular(empresaId, anio, mes);
    const { vista } = this.lineas(calculo, await this.cuentas(empresaId));
    return {
      anio,
      mes,
      fechaPartida: finMes(anio, mes),
      tasa: calculo.tasa,
      ingresosBrutos: calculo.ingresosBrutos,
      pagoACuenta: calculo.pagoACuenta,
      retencionesPlanilla: calculo.retencionesPlanilla,
      retencionesServicios: calculo.retencionesServicios,
      totalRetenciones: calculo.totalRetenciones,
      totalAEnterar: calculo.totalAEnterar,
      lineasPartida: vista,
      declaracion: await this.declaracion(empresaId, anio, mes, calculo),
      periodoAbierto: await this.periodoAbierto(empresaId, anio, mes),
    };
  }

  async generarPartida(empresaId: string, anio: number, mes: number): Promise<PagoACuentaVista> {
    const calculo = await this.calcular(empresaId, anio, mes);
    if (Dinero.de(calculo.pagoACuenta).esCero()) {
      throw new ReglaPagoACuentaError(
        `No hay ingresos brutos contabilizados en ${MESES[mes - 1]} de ${anio}: no hay pago a cuenta que determinar.`,
      );
    }
    const { activo, pasivo } = this.lineas(calculo, await this.cuentas(empresaId));
    if (!activo) {
      throw new ReglaPagoACuentaError(
        `Falta la cuenta ${CUENTAS_PAGO_A_CUENTA.pagoACuentaActivo} (Pago a Cuenta) para determinar el pago a cuenta.`,
      );
    }
    if (!pasivo) {
      throw new ReglaPagoACuentaError(
        `Falta la cuenta ${CUENTAS_PAGO_A_CUENTA.pagoACuentaPasivo} (Pago a Cuenta por pagar) para determinar el pago a cuenta.`,
      );
    }
    const matriz = await this.tx.sucursal.findFirst({
      where: { empresaId, esMatriz: true, activa: true },
      select: { id: true },
    });
    if (!matriz)
      throw new ReglaPagoACuentaError("La empresa no tiene una casa matriz activa para la partida.");

    const periodo = new Date(`${inicioMes(anio, mes)}T00:00:00Z`);
    const existente = await this.tx.pagoACuenta.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
      include: { partida: { select: { estado: true } } },
    });
    if (existente && (existente.presentadaEn || existente.partida.estado !== "anulada")) {
      throw new ConflictoPagoACuentaError(
        existente.presentadaEn
          ? "El F-14 de ese mes ya fue presentado."
          : "Ya existe una partida de pago a cuenta de ese mes; anúlela si necesita generarla de nuevo.",
      );
    }

    try {
      const partida = await this.tx.partida.create({
        data: {
          empresaId,
          sucursalId: matriz.id,
          fecha: new Date(`${finMes(anio, mes)}T00:00:00Z`),
          tipo: "ajuste",
          concepto: `Ajuste: determinación del pago a cuenta del ISR de ${MESES[mes - 1]} ${anio}, ${calculo.tasa}% de los ingresos brutos (F-14)`,
          origen: "pago_a_cuenta",
          detalles: {
            create: [
              { empresaId, cuentaId: activo.id, debe: calculo.pagoACuenta, haber: "0.00", orden: 0 },
              { empresaId, cuentaId: pasivo.id, debe: "0.00", haber: calculo.pagoACuenta, orden: 1 },
            ],
          },
        },
        select: { id: true },
      });
      const datos = {
        tasa: TASA_PAGO_A_CUENTA,
        ingresosBrutos: calculo.ingresosBrutos,
        pagoACuenta: calculo.pagoACuenta,
        retencionesPlanilla: calculo.retencionesPlanilla,
        retencionesServicios: calculo.retencionesServicios,
        partidaId: partida.id,
      };
      if (existente) await this.tx.pagoACuenta.update({ where: { id: existente.id }, data: datos });
      else await this.tx.pagoACuenta.create({ data: { empresaId, periodo, ...datos } });
    } catch (error) {
      if (esDuplicado(error)) {
        throw new ConflictoPagoACuentaError("Ya existe una partida de pago a cuenta de ese mes.");
      }
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaPagoACuentaError(regla);
      throw error;
    }
    return this.consultar(empresaId, anio, mes);
  }

  async presentar(
    usuarioId: string,
    empresaId: string,
    anio: number,
    mes: number,
  ): Promise<PagoACuentaVista> {
    const periodo = new Date(`${inicioMes(anio, mes)}T00:00:00Z`);
    const fila = await this.tx.pagoACuenta.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
      include: { partida: { select: { estado: true } } },
    });
    if (!fila) throw new PagoACuentaNoEncontradoError();
    if (fila.presentadaEn) return this.consultar(empresaId, anio, mes);
    if (fila.partida.estado !== "contabilizada") {
      throw new ReglaPagoACuentaError(
        "Contabilice la partida del pago a cuenta antes de marcar el F-14 como presentado.",
      );
    }
    try {
      await this.tx.pagoACuenta.update({
        where: { id: fila.id },
        data: { presentadaPor: usuarioId, presentadaEn: new Date() },
      });
    } catch (error) {
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaPagoACuentaError(regla);
      throw error;
    }
    return this.consultar(empresaId, anio, mes);
  }

  async ejercicio(empresaId: string, anio: number): Promise<PagosACuentaEjercicioVista> {
    const filas = await this.tx.pagoACuenta.findMany({
      where: {
        empresaId,
        periodo: { gte: new Date(`${anio}-01-01T00:00:00Z`), lte: new Date(`${anio}-12-01T00:00:00Z`) },
      },
      include: { partida: { select: { estado: true } } },
      orderBy: { periodo: "asc" },
    });
    const porMes = new Map(filas.map((f) => [f.periodo.getUTCMonth() + 1, f]));
    const meses = Array.from({ length: 12 }, (_, i) => {
      const fila = porMes.get(i + 1);
      return {
        mes: i + 1,
        pagoACuenta: fila?.pagoACuenta.toFixed(2) ?? "0.00",
        estadoPartida: (fila?.partida.estado as EstadoPartidaPagoACuenta | undefined) ?? null,
        presentada: Boolean(fila?.presentadaEn),
      };
    });
    const suma = (estado: EstadoPartidaPagoACuenta) =>
      Dinero.sumar(meses.filter((m) => m.estadoPartida === estado).map((m) => m.pagoACuenta)).aTexto();
    return { anio, meses, totalContabilizado: suma("contabilizada"), totalEnBorrador: suma("borrador") };
  }
}

@Injectable()
export class RepositorioPagoACuentaPrisma implements RepositorioPagoACuenta {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadPagoACuenta) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
