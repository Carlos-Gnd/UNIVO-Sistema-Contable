import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import {
  Dinero,
  calcularIsrAnual,
  type ConfiguracionIsrVista,
  type CrearConfiguracionIsr,
  type EjercicioSiguienteVista,
  type EstadoCierreAnual,
  type LineaPartidaAnualVista,
  type PartidaAnualVista,
  type ResultadoProvisionIsr,
} from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  AlcanceCierreAnualIncompletoError,
  ConfiguracionIsrNoEncontradaError,
  ConflictoCierreAnualError,
  EmpresaCierreAnualNoEncontradaError,
  EjercicioCierreAnualNoEncontradoError,
  EjercicioSiguienteNoEncontradoError,
  ReglaCierreAnualError,
  type AccesoCierreAnual,
  type RepositorioCierreAnual,
  type UnidadCierreAnual,
} from "../domain/cierre-anual.js";
import { armarBalanza, type FilaSaldos } from "../../reportes/domain/balanza.js";
import { armarEstadoResultados } from "../../reportes/domain/estados.js";
import { UnidadPrisma } from "../../reportes/infrastructure/repositorio-balanza.prisma.js";

type FilaConfiguracion = {
  id: string;
  ejercicioAnio: number;
  version: number;
  tasaSociedad: { toFixed(decimales: number): string } | null;
  creadoEn: Date;
  tramos: {
    orden: number;
    desde: { toFixed(decimales: number): string };
    hasta: { toFixed(decimales: number): string } | null;
    porcentaje: { toFixed(decimales: number): string };
    cuotaFija: { toFixed(decimales: number): string };
  }[];
};

const fechaTexto = (fecha: Date) => fecha.toISOString().slice(0, 10);
const codigoPagoCuenta = "111104";
const codigoCapital = "3101";
const codigoReserva = "3103";
const codigoCuentaCierre = "6101";

type FilaPartidaAnual = {
  id: string;
  estado: string;
  fecha: Date;
  detalles: {
    debe: { toFixed(decimales: number): string };
    haber: { toFixed(decimales: number): string };
    cuenta: { codigo: string; nombre: string };
  }[];
};

function aPartidaAnual(fila: FilaPartidaAnual): PartidaAnualVista {
  return {
    id: fila.id,
    estado: fila.estado as "borrador" | "contabilizada",
    fecha: fechaTexto(fila.fecha),
    lineas: fila.detalles.map((detalle) => ({
      codigo: detalle.cuenta.codigo,
      nombre: detalle.cuenta.nombre,
      debe: detalle.debe.toFixed(2),
      haber: detalle.haber.toFixed(2),
    })),
  };
}

function aVista(
  fila: FilaConfiguracion,
  tipoContribuyente: "persona_natural" | "sociedad",
): ConfiguracionIsrVista {
  return {
    id: fila.id,
    anio: fila.ejercicioAnio,
    version: fila.version,
    tipoContribuyente,
    tasaSociedad: fila.tasaSociedad?.toFixed(2) ?? null,
    tramos: fila.tramos.map((tramo) => ({
      desde: tramo.desde.toFixed(2),
      hasta: tramo.hasta?.toFixed(2) ?? null,
      porcentaje: tramo.porcentaje.toFixed(2),
      cuotaFija: tramo.cuotaFija.toFixed(2),
    })),
    creadoEn: fila.creadoEn.toISOString(),
  };
}

function saldoFinal(fila: FilaSaldos): Dinero {
  return Dinero.de(fila.saldoInicial).mas(fila.movimientoDebe).menos(fila.movimientoHaber);
}

function saldoAcreedor(filas: readonly FilaSaldos[], prefijo: string): Dinero {
  return Dinero.sumar(
    filas
      .filter((fila) => fila.codigo.startsWith(prefijo))
      .map((fila) => {
        const saldo = saldoFinal(fila);
        return saldo.esNegativo() ? saldo.abs() : Dinero.cero();
      }),
  );
}

function pagosDelEjercicio(filas: readonly FilaSaldos[]): Dinero {
  return Dinero.sumar(
    filas
      .filter((fila) => fila.codigo.startsWith(codigoPagoCuenta))
      .map((fila) => Dinero.de(fila.movimientoDebe).menos(fila.movimientoHaber)),
  );
}

function crearDetalleIsr(
  inicio: string,
  fin: string,
  tipoContribuyente: "persona_natural" | "sociedad",
  filas: readonly FilaSaldos[],
  config: FilaConfiguracion,
  pagoAplicadoEnProvision: string,
): ReturnType<typeof calcularIsrAnual> {
  const estado = armarEstadoResultados({ desde: inicio, hasta: fin, sucursalId: null }, filas, new Map());
  const provisionAnterior = Dinero.de(pagoAplicadoEnProvision);
  const pagos = pagosDelEjercicio(filas).mas(provisionAnterior);
  const capital = tipoContribuyente === "sociedad" ? saldoAcreedor(filas, codigoCapital) : Dinero.cero();
  const reserva = tipoContribuyente === "sociedad" ? saldoAcreedor(filas, codigoReserva) : Dinero.cero();
  return calcularIsrAnual({
    tipoContribuyente,
    utilidadAntesImpuesto: estado.utilidadAntesImpuesto,
    pagosACuenta: pagos.aTexto(),
    tasaSociedad: config.tasaSociedad?.toFixed(2),
    tramos: config.tramos.map((tramo) => ({
      desde: tramo.desde.toFixed(2),
      hasta: tramo.hasta?.toFixed(2) ?? null,
      porcentaje: tramo.porcentaje.toFixed(2),
      cuotaFija: tramo.cuotaFija.toFixed(2),
    })),
    capitalSocial: capital.aTexto(),
    reservaLegalActual: reserva.aTexto(),
  });
}

function esDuplicado(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

class UnidadPrismaCierreAnual implements UnidadCierreAnual {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoCierreAnual | null> {
    const [fila] = await this.tx.$queryRaw<
      { todas_sucursales: boolean; permisos: string[]; sucursales: string[] }[]
    >`
      SELECT m.todas_sucursales,
             ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                   WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id) AS permisos,
             ARRAY(SELECT ms.sucursal_id::text FROM membresia_sucursales ms
                   WHERE ms.membresia_id = m.id) AS sucursales
      FROM membresias m
      JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      JOIN empresas e ON e.id = m.empresa_id AND e.activa
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    return fila
      ? {
          permisos: new Set(fila.permisos),
          todasSucursales: fila.todas_sucursales,
          sucursales: fila.sucursales,
        }
      : null;
  }

  private async ejercicio(empresaId: string, anio: number) {
    const ejercicio = await this.tx.ejercicio.findUnique({
      where: { empresaId_anio: { empresaId, anio } },
      include: {
        empresa: { select: { tipoContribuyente: true } },
        periodos: { orderBy: { mes: "asc" } },
      },
    });
    if (!ejercicio) throw new EjercicioCierreAnualNoEncontradoError();
    return ejercicio;
  }

  private async configuracion(empresaId: string, anio: number): Promise<FilaConfiguracion | null> {
    return this.tx.configuracionIsr.findFirst({
      where: { empresaId, ejercicioAnio: anio },
      include: { tramos: { orderBy: { orden: "asc" } } },
      orderBy: { version: "desc" },
    });
  }

  private async filasSaldos(
    empresaId: string,
    inicio: string,
    fin: string,
    acceso: AccesoCierreAnual,
    tipo: "ajustada" | "posterior-cierre" = "ajustada",
  ): Promise<FilaSaldos[]> {
    return new UnidadPrisma(this.tx).saldos({
      empresaId,
      tipo,
      desde: inicio,
      hasta: fin,
      inicioEjercicio: inicio,
      sucursales: acceso.todasSucursales ? null : acceso.sucursales,
    });
  }

  private async cantidadPartidasDescuadradas(
    empresaId: string,
    periodoIds: readonly string[],
    acceso: AccesoCierreAnual,
  ): Promise<number> {
    if (periodoIds.length === 0) return 0;
    const todas = acceso.todasSucursales;
    const sucursales = [...acceso.sucursales];
    const [fila] = await this.tx.$queryRaw<{ cantidad: number }[]>`
      SELECT count(*)::int AS cantidad FROM (
        SELECT p.id
        FROM partidas p
        LEFT JOIN partida_detalles d ON d.partida_id = p.id
        WHERE p.empresa_id = ${empresaId}::uuid
          AND p.periodo_id = ANY(${[...periodoIds]}::uuid[])
          AND p.estado IN ('contabilizada', 'anulada')
          AND (${todas} OR p.sucursal_id = ANY(${sucursales}::uuid[]))
        GROUP BY p.id
        HAVING coalesce(sum(d.debe), 0) <> coalesce(sum(d.haber), 0)
      ) partidas_descuadradas`;
    return fila?.cantidad ?? 0;
  }

  private async borradores(
    empresaId: string,
    periodoIds: readonly string[],
    acceso: AccesoCierreAnual,
    configuracionId: string | null,
  ): Promise<number> {
    if (periodoIds.length === 0) return 0;
    return this.tx.partida.count({
      where: {
        empresaId,
        periodoId: { in: [...periodoIds] },
        estado: "borrador",
        ...(acceso.todasSucursales ? {} : { sucursalId: { in: [...acceso.sucursales] } }),
        ...(configuracionId ? { NOT: { origen: "isr_ejercicio", origenId: configuracionId } } : {}),
      },
    });
  }

  private async partidaIsr(empresaId: string, configuracionId: string | null) {
    if (!configuracionId) return null;
    return this.tx.partida.findFirst({
      where: {
        empresaId,
        origen: "isr_ejercicio",
        origenId: configuracionId,
        estado: { in: ["borrador", "contabilizada"] },
      },
      select: {
        id: true,
        estado: true,
        fecha: true,
        detalles: { select: { haber: true, cuenta: { select: { codigo: true } } } },
      },
    });
  }

  private partidaAnual(
    empresaId: string,
    origen: string,
    origenId: string,
  ): Promise<FilaPartidaAnual | null> {
    return this.tx.partida.findFirst({
      where: { empresaId, origen, origenId, estado: { in: ["borrador", "contabilizada"] } },
      include: {
        detalles: {
          orderBy: { orden: "asc" },
          select: { debe: true, haber: true, cuenta: { select: { codigo: true, nombre: true } } },
        },
      },
      orderBy: { creadoEn: "desc" },
    });
  }

  private async cuentasCierre(empresaId: string, codigos: readonly string[]) {
    return this.tx.cuenta.findMany({
      where: { empresaId, activa: true, codigo: { in: [...codigos] }, hijas: { none: {} } },
      select: { id: true, codigo: true, nombre: true },
    });
  }

  private async lineasCierre(
    empresaId: string,
    filas: readonly FilaSaldos[],
    tipoContribuyente: "persona_natural" | "sociedad",
    detalle: NonNullable<EstadoCierreAnual["detalleIsr"]>,
  ): Promise<{ utilidadNeta: string; lineas: LineaPartidaAnualVista[] } | null> {
    let debeResultados = Dinero.cero();
    let haberResultados = Dinero.cero();
    const lineas: LineaPartidaAnualVista[] = [];
    const cuentasResultado = new Map(
      filas
        .filter((fila) => fila.tipo === "ingresos" || fila.tipo === "costos_gastos")
        .map((fila) => [fila.codigo, fila]),
    );

    for (const fila of cuentasResultado.values()) {
      const saldo = saldoFinal(fila);
      if (saldo.esCero()) continue;
      const debe = saldo.esNegativo() ? saldo.abs() : Dinero.cero();
      const haber = saldo.esNegativo() ? Dinero.cero() : saldo;
      lineas.push({ codigo: fila.codigo, nombre: fila.nombre, debe: debe.aTexto(), haber: haber.aTexto() });
      debeResultados = debeResultados.mas(debe);
      haberResultados = haberResultados.mas(haber);
    }
    const cuentaCierre = filas.find((fila) => fila.codigo === codigoCuentaCierre);
    const saldoCierre = cuentaCierre ? saldoFinal(cuentaCierre) : Dinero.cero();
    if (lineas.length === 0 && saldoCierre.esCero()) return null;

    const utilidadPorTrasladar = debeResultados.menos(haberResultados).menos(saldoCierre);
    const reserva =
      tipoContribuyente === "sociedad" ? Dinero.de(detalle.reservaLegalAProvisionar) : Dinero.cero();
    if (!reserva.esCero() && reserva.mayorQue(detalle.utilidadDespuesDeImpuesto)) {
      throw new ReglaCierreAnualError("La reserva legal calculada supera la utilidad neta disponible.");
    }
    const codigosNecesarios = [
      codigoCuentaCierre,
      ...(utilidadPorTrasladar.esNegativo() ? ["3106", "310702"] : ["3106"]),
      ...(reserva.esCero() ? [] : [codigoReserva, "3106"]),
    ];
    const cuentas = new Map(
      (await this.cuentasCierre(empresaId, codigosNecesarios)).map((cuenta) => [cuenta.codigo, cuenta]),
    );
    const agregar = (codigo: string, debe: Dinero, haber: Dinero) => {
      if (debe.esCero() && haber.esCero()) return;
      const cuenta = cuentas.get(codigo);
      if (!cuenta)
        throw new ReglaCierreAnualError(`Falta la cuenta ${codigo} para registrar el cierre anual.`);
      lineas.push({ codigo, nombre: cuenta.nombre, debe: debe.aTexto(), haber: haber.aTexto() });
    };

    agregar(codigoCuentaCierre, haberResultados, Dinero.cero());
    agregar(codigoCuentaCierre, Dinero.cero(), debeResultados);
    if (utilidadPorTrasladar.esNegativo()) {
      const perdida = utilidadPorTrasladar.abs();
      const cuentaUtilidad = filas.find((fila) => fila.codigo === "3106");
      const saldoUtilidad = cuentaUtilidad ? saldoFinal(cuentaUtilidad) : Dinero.cero();
      const utilidadDisponible = saldoUtilidad.esNegativo() ? saldoUtilidad.abs() : Dinero.cero();
      const compensada = perdida.mayorQue(utilidadDisponible) ? utilidadDisponible : perdida;
      const deficit = perdida.menos(compensada);
      agregar(codigoCuentaCierre, Dinero.cero(), perdida);
      agregar("3106", compensada, Dinero.cero());
      agregar("310702", deficit, Dinero.cero());
    } else if (!utilidadPorTrasladar.esCero()) {
      agregar(codigoCuentaCierre, utilidadPorTrasladar, Dinero.cero());
      agregar("3106", Dinero.cero(), utilidadPorTrasladar);
    }
    if (!reserva.esCero()) {
      agregar("3106", reserva, Dinero.cero());
      agregar(codigoReserva, Dinero.cero(), reserva);
    }

    const totalDebe = Dinero.sumar(lineas.map((linea) => linea.debe));
    const totalHaber = Dinero.sumar(lineas.map((linea) => linea.haber));
    if (!totalDebe.igualA(totalHaber)) {
      throw new ReglaCierreAnualError("La vista previa de la partida de cierre anual no cuadra.");
    }
    return { utilidadNeta: detalle.utilidadDespuesDeImpuesto, lineas };
  }

  private lineasReapertura(filas: readonly FilaSaldos[]): LineaPartidaAnualVista[] {
    const lineas = filas
      .filter((fila) => fila.tipo === "activo" || fila.tipo === "pasivo" || fila.tipo === "patrimonio")
      .flatMap((fila) => {
        const saldo = saldoFinal(fila);
        if (saldo.esCero()) return [];
        return [
          {
            codigo: fila.codigo,
            nombre: fila.nombre,
            debe: saldo.esNegativo() ? "0.00" : saldo.aTexto(),
            haber: saldo.esNegativo() ? saldo.abs().aTexto() : "0.00",
          },
        ];
      });
    const debe = Dinero.sumar(lineas.map((linea) => linea.debe));
    const haber = Dinero.sumar(lineas.map((linea) => linea.haber));
    if (lineas.length === 0 || !debe.igualA(haber)) {
      throw new ReglaCierreAnualError(
        "Los saldos de balance del ejercicio cerrado no forman una reapertura balanceada.",
      );
    }
    return lineas;
  }

  async estado(empresaId: string, anio: number, acceso: AccesoCierreAnual): Promise<EstadoCierreAnual> {
    const ejercicio = await this.ejercicio(empresaId, anio);
    const inicio = fechaTexto(ejercicio.fechaInicio);
    const fin = fechaTexto(ejercicio.fechaFin);
    const periodos = ejercicio.periodos;
    const periodoIds = periodos.map((periodo) => periodo.id);
    const config = await this.configuracion(empresaId, anio);
    const borradores = await this.borradores(empresaId, periodoIds, acceso, config?.id ?? null);
    const partidasDescuadradas = await this.cantidadPartidasDescuadradas(empresaId, periodoIds, acceso);
    const filas = await this.filasSaldos(empresaId, inicio, fin, acceso);
    const balanza = armarBalanza("ajustada", { desde: inicio, hasta: fin, sucursalId: null }, filas);
    const mesesAbiertos = periodos
      .filter((periodo) => periodo.estado === "abierto")
      .map((periodo) => periodo.mes);
    const cerrados = periodos.filter((periodo) => periodo.estado === "cerrado").length;
    const periodosListos =
      periodos.length === 12 &&
      periodos.every((periodo) =>
        periodo.mes === 12 ? periodo.estado === "abierto" : periodo.estado === "cerrado",
      );
    const partidaIsr = await this.partidaIsr(empresaId, config?.id ?? null);
    const pagoProvision =
      partidaIsr?.estado === "contabilizada"
        ? Dinero.sumar(
            partidaIsr.detalles
              .filter((detalle) => detalle.cuenta.codigo.startsWith(codigoPagoCuenta))
              .map((detalle) => detalle.haber.toFixed(2)),
          ).aTexto()
        : "0.00";
    const detalleIsr =
      config && acceso.todasSucursales
        ? crearDetalleIsr(inicio, fin, ejercicio.empresa.tipoContribuyente, filas, config, pagoProvision)
        : null;
    const configuracionIsr = config ? aVista(config, ejercicio.empresa.tipoContribuyente) : null;
    const sinBorradores = borradores === 0;
    const partidasCuadradas = partidasDescuadradas === 0;
    const listoParaIsr =
      sinBorradores && periodosListos && partidasCuadradas && balanza.cuadra && acceso.todasSucursales;
    const partidaCierreDb = acceso.todasSucursales
      ? await this.partidaAnual(empresaId, "cierre_anual", ejercicio.id)
      : null;
    const partidaCierre = partidaCierreDb ? aPartidaAnual(partidaCierreDb) : null;
    const siguienteDb = await this.tx.ejercicio.findUnique({
      where: { empresaId_anio: { empresaId, anio: anio + 1 } },
      select: {
        id: true,
        anio: true,
        estado: true,
        periodos: { where: { mes: 1 }, select: { id: true, fechaInicio: true, estado: true } },
      },
    });
    const periodoInicialSiguiente = siguienteDb?.periodos[0];
    const ejercicioSiguiente: EjercicioSiguienteVista | null =
      siguienteDb && periodoInicialSiguiente
        ? {
            id: siguienteDb.id,
            anio: siguienteDb.anio,
            periodoInicialId: periodoInicialSiguiente.id,
            fechaInicio: fechaTexto(periodoInicialSiguiente.fechaInicio),
            estado: siguienteDb.estado,
          }
        : null;
    const partidaReaperturaDb =
      ejercicioSiguiente && acceso.todasSucursales
        ? await this.partidaAnual(empresaId, "reapertura_ejercicio", ejercicio.id)
        : null;
    const partidaReapertura = partidaReaperturaDb ? aPartidaAnual(partidaReaperturaDb) : null;
    const puedeVistaCierre = Boolean(
      config &&
      detalleIsr &&
      acceso.todasSucursales &&
      partidasCuadradas &&
      balanza.cuadra &&
      (partidaCierreDb ||
        (sinBorradores &&
          periodosListos &&
          (Dinero.de(detalleIsr.impuestoDeterminado).esCero() || partidaIsr?.estado === "contabilizada"))),
    );
    const vistaCierre = puedeVistaCierre
      ? await this.lineasCierre(
          empresaId,
          await this.filasSaldos(empresaId, inicio, fin, acceso, "posterior-cierre"),
          ejercicio.empresa.tipoContribuyente,
          detalleIsr!,
        )
      : null;
    const filasReapertura =
      ejercicio.estado === "cerrado" && ejercicioSiguiente && acceso.todasSucursales
        ? await new UnidadPrisma(this.tx).saldos({
            empresaId,
            tipo: "posterior-cierre",
            desde: inicio,
            hasta: fin,
            inicioEjercicio: inicio,
            sucursales: null,
          })
        : null;
    const vistaReapertura = filasReapertura ? { lineas: this.lineasReapertura(filasReapertura) } : null;

    return {
      ejercicioId: ejercicio.id,
      anio,
      tipoContribuyente: ejercicio.empresa.tipoContribuyente,
      periodos: periodos.map((periodo) => ({ id: periodo.id, mes: periodo.mes, estado: periodo.estado })),
      validaciones: {
        sinBorradores: { ok: sinBorradores, cantidad: borradores },
        periodosListos: { ok: periodosListos, cerrados, total: 12, mesesAbiertos },
        partidasCuadradas: { ok: partidasCuadradas, cantidad: partidasDescuadradas },
        balanza: {
          ok: balanza.cuadra,
          debe: balanza.totales.saldoFinalDebe,
          haber: balanza.totales.saldoFinalHaber,
          diferencia: balanza.diferencias.saldoFinal,
        },
      },
      listoParaIsr,
      permisoGenerar: acceso.permisos.has("declaraciones.generar"),
      permisoCerrar: acceso.permisos.has("periodos.cerrar"),
      permisoReabrir: acceso.permisos.has("partidas.registrar"),
      todasSucursales: acceso.todasSucursales,
      ejercicioCerrado: ejercicio.estado === "cerrado",
      ejercicioSiguiente,
      configuracionIsr,
      detalleIsr,
      partidaIsr: partidaIsr
        ? {
            id: partidaIsr.id,
            estado: partidaIsr.estado as "borrador" | "contabilizada",
            fecha: fechaTexto(partidaIsr.fecha),
          }
        : null,
      vistaCierre,
      partidaCierre,
      vistaReapertura,
      partidaReapertura,
    };
  }

  async crearConfiguracion(
    _usuarioId: string,
    empresaId: string,
    datos: CrearConfiguracionIsr,
  ): Promise<ConfiguracionIsrVista> {
    const ejercicio = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM ejercicios
      WHERE empresa_id = ${empresaId}::uuid AND anio = ${datos.anio}
      FOR UPDATE`;
    if (ejercicio.length === 0) throw new EjercicioCierreAnualNoEncontradoError();

    const empresa = await this.tx.empresa.findUnique({
      where: { id: empresaId },
      select: { tipoContribuyente: true },
    });
    if (!empresa) throw new EmpresaCierreAnualNoEncontradaError();
    if (empresa.tipoContribuyente !== datos.tipoContribuyente) {
      throw new ReglaCierreAnualError(
        "La configuración no coincide con el tipo de contribuyente de la empresa.",
      );
    }

    const ejercicioDb = await this.ejercicio(empresaId, datos.anio);
    const activo = await this.tx.partida.findFirst({
      where: {
        empresaId,
        fecha: { gte: ejercicioDb.fechaInicio, lte: ejercicioDb.fechaFin },
        origen: "isr_ejercicio",
        estado: { in: ["borrador", "contabilizada"] },
      },
      select: { id: true },
    });
    if (activo) {
      throw new ConflictoCierreAnualError(
        "Anule la provisión de ISR vigente antes de registrar otra configuración para el ejercicio.",
      );
    }

    const anterior = await this.configuracion(empresaId, datos.anio);
    const version = (anterior?.version ?? 0) + 1;
    if (version > 32767)
      throw new ReglaCierreAnualError("El ejercicio ya alcanzó el máximo de versiones de ISR.");

    try {
      const fila = await this.tx.configuracionIsr.create({
        data: {
          empresaId,
          ejercicioAnio: datos.anio,
          version,
          tasaSociedad: datos.tipoContribuyente === "sociedad" ? datos.tasaSociedad : null,
          tramos:
            datos.tipoContribuyente === "persona_natural"
              ? {
                  create: datos.tramos.map((tramo, orden) => ({
                    orden: orden + 1,
                    desde: tramo.desde,
                    hasta: tramo.hasta,
                    porcentaje: tramo.porcentaje,
                    cuotaFija: tramo.cuotaFija,
                  })),
                }
              : undefined,
        },
        include: { tramos: { orderBy: { orden: "asc" } } },
      });
      return aVista(fila, empresa.tipoContribuyente);
    } catch (error) {
      if (esDuplicado(error)) {
        throw new ConflictoCierreAnualError(
          "Ya existe esa versión de configuración del ISR para el ejercicio.",
        );
      }
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaCierreAnualError(regla);
      throw error;
    }
  }

  async calcularYProvisionar(
    usuarioId: string,
    empresaId: string,
    anio: number,
  ): Promise<ResultadoProvisionIsr> {
    const acceso = await this.acceso(usuarioId, empresaId);
    if (!acceso) throw new EmpresaCierreAnualNoEncontradaError();
    if (!acceso.todasSucursales) throw new AlcanceCierreAnualIncompletoError();

    const bloqueado = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM ejercicios
      WHERE empresa_id = ${empresaId}::uuid AND anio = ${anio}
      FOR UPDATE`;
    if (bloqueado.length === 0) throw new EjercicioCierreAnualNoEncontradoError();

    const ejercicio = await this.ejercicio(empresaId, anio);
    const config = await this.configuracion(empresaId, anio);
    if (!config) throw new ConfiguracionIsrNoEncontradaError();
    const estado = await this.estado(empresaId, anio, acceso);
    if (!estado.listoParaIsr) {
      throw new ConflictoCierreAnualError(
        "Complete las validaciones del paso 1: cierre los períodos anteriores, deje diciembre abierto y quite los borradores.",
      );
    }
    const detalle = estado.detalleIsr;
    if (!detalle) throw new ReglaCierreAnualError("No se pudo obtener el detalle del ISR del ejercicio.");
    if (estado.partidaIsr) {
      return {
        detalle,
        partida: {
          id: estado.partidaIsr.id,
          estado: estado.partidaIsr.estado,
          fecha: estado.partidaIsr.fecha,
        },
      };
    }
    if (Dinero.de(detalle.impuestoDeterminado).esCero()) return { detalle, partida: null };

    const cuentaIds = new Map(
      (
        await this.tx.cuenta.findMany({
          where: {
            empresaId,
            activa: true,
            codigo: { in: ["4204", "111104", "211102"] },
          },
          select: { id: true, codigo: true },
        })
      ).map((cuenta) => [cuenta.codigo, cuenta.id]),
    );
    const gasto = cuentaIds.get("4204");
    if (!gasto)
      throw new ReglaCierreAnualError("Falta la cuenta 4204 para registrar el gasto por ISR corriente.");

    const lineas: { cuentaId: string; debe: string; haber: string; orden: number }[] = [
      { cuentaId: gasto, debe: detalle.impuestoDeterminado, haber: "0.00", orden: 0 },
    ];
    let orden = 1;
    if (!Dinero.de(detalle.pagosAplicados).esCero()) {
      const pagoCuenta = cuentaIds.get("111104");
      if (!pagoCuenta) {
        throw new ReglaCierreAnualError(
          "Falta la cuenta 111104 para acreditar los pagos a cuenta del ejercicio.",
        );
      }
      lineas.push({ cuentaId: pagoCuenta, debe: "0.00", haber: detalle.pagosAplicados, orden: orden++ });
    }
    if (!Dinero.de(detalle.impuestoPendiente).esCero()) {
      const impuestoPorPagar = cuentaIds.get("211102");
      if (!impuestoPorPagar) {
        throw new ReglaCierreAnualError("Falta la cuenta 211102 para registrar el ISR pendiente de pago.");
      }
      lineas.push({ cuentaId: impuestoPorPagar, debe: "0.00", haber: detalle.impuestoPendiente, orden });
    }

    const sucursal = await this.tx.sucursal.findFirst({
      where: { empresaId, esMatriz: true, activa: true },
      select: { id: true },
    });
    if (!sucursal)
      throw new ReglaCierreAnualError("La empresa no tiene una casa matriz activa para la provisión.");

    const concepto = `Provisión anual del ISR, ejercicio ${anio}`;
    try {
      const partida = await this.tx.partida.create({
        data: {
          empresaId,
          sucursalId: sucursal.id,
          fecha: ejercicio.fechaFin,
          tipo: "ajuste",
          concepto,
          origen: "isr_ejercicio",
          origenId: config.id,
          detalles: {
            create: lineas.map((linea) => ({
              empresaId,
              cuentaId: linea.cuentaId,
              debe: linea.debe,
              haber: linea.haber,
              orden: linea.orden,
            })),
          },
        },
        select: { id: true, estado: true, fecha: true },
      });
      return {
        detalle,
        partida: { id: partida.id, estado: "borrador", fecha: fechaTexto(partida.fecha) },
      };
    } catch (error) {
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaCierreAnualError(regla);
      if (esDuplicado(error))
        throw new ConflictoCierreAnualError("Ya existe una provisión de ISR para esta configuración.");
      throw error;
    }
  }

  async cerrarNoviembre(empresaId: string, anio: number, acceso: AccesoCierreAnual): Promise<void> {
    if (!acceso.todasSucursales) throw new AlcanceCierreAnualIncompletoError();
    const ejercicio = await this.ejercicio(empresaId, anio);
    const ids = ejercicio.periodos.map((periodo) => periodo.id);
    const periodos = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM periodos
      WHERE empresa_id = ${empresaId}::uuid AND ejercicio_id = ${ejercicio.id}::uuid
      ORDER BY mes FOR UPDATE`;
    if (periodos.length !== 12)
      throw new ReglaCierreAnualError("El ejercicio no tiene sus doce períodos mensuales.");
    const previosAbiertos = ejercicio.periodos.filter(
      (periodo) => periodo.mes < 11 && periodo.estado !== "cerrado",
    );
    if (previosAbiertos.length > 0) {
      throw new ConflictoCierreAnualError(
        "Cierre los períodos de enero a octubre antes de cerrar noviembre.",
      );
    }
    const noviembre = ejercicio.periodos.find((periodo) => periodo.mes === 11);
    const diciembre = ejercicio.periodos.find((periodo) => periodo.mes === 12);
    if (!noviembre || !diciembre || diciembre.estado !== "abierto") {
      throw new ConflictoCierreAnualError(
        "Diciembre debe permanecer abierto para registrar la provisión anual.",
      );
    }
    if (noviembre.estado === "cerrado") return;

    const borradores = await this.tx.partida.findMany({
      where: { empresaId, periodoId: { in: ids }, estado: "borrador" },
      select: { id: true, concepto: true },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });
    if (borradores.length > 0) {
      throw new ConflictoCierreAnualError(
        "No se puede cerrar noviembre mientras el ejercicio tenga partidas en borrador.",
      );
    }
    await this.tx.periodo.update({ where: { id: noviembre.id }, data: { estado: "cerrado" } });
  }

  async crearPartidaCierre(
    empresaId: string,
    anio: number,
    acceso: AccesoCierreAnual,
  ): Promise<PartidaAnualVista> {
    if (!acceso.todasSucursales) throw new AlcanceCierreAnualIncompletoError();
    const bloqueado = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM ejercicios
      WHERE empresa_id = ${empresaId}::uuid AND anio = ${anio}
      FOR UPDATE`;
    if (bloqueado.length === 0) throw new EjercicioCierreAnualNoEncontradoError();
    const ejercicio = await this.ejercicio(empresaId, anio);
    if (ejercicio.estado === "cerrado") throw new ConflictoCierreAnualError("El ejercicio ya está cerrado.");

    const existente = await this.partidaAnual(empresaId, "cierre_anual", ejercicio.id);
    if (existente) return aPartidaAnual(existente);

    const estado = await this.estado(empresaId, anio, acceso);
    if (!estado.configuracionIsr || !estado.detalleIsr) throw new ConfiguracionIsrNoEncontradaError();
    if (!estado.listoParaIsr) {
      throw new ConflictoCierreAnualError(
        "Complete las validaciones y contabilice la provisión de ISR antes de generar la partida de cierre.",
      );
    }
    if (estado.partidaIsr?.estado === "borrador") {
      throw new ConflictoCierreAnualError(
        "Contabilice la provisión de ISR antes de generar la partida de cierre.",
      );
    }
    if (!Dinero.de(estado.detalleIsr.impuestoDeterminado).esCero() && !estado.partidaIsr) {
      throw new ConflictoCierreAnualError(
        "Genere y contabilice la provisión de ISR antes de cerrar el ejercicio.",
      );
    }
    if (ejercicio.periodos.some((periodo) => periodo.mes < 12 && periodo.estado !== "cerrado")) {
      throw new ConflictoCierreAnualError(
        "Cierre los períodos de enero a noviembre antes de cerrar el ejercicio.",
      );
    }
    const diciembre = ejercicio.periodos.find((periodo) => periodo.mes === 12);
    if (!diciembre || diciembre.estado !== "abierto") {
      throw new ConflictoCierreAnualError(
        "Diciembre debe permanecer abierto para registrar la partida de cierre.",
      );
    }
    const vista = await this.lineasCierre(
      empresaId,
      await this.filasSaldos(
        empresaId,
        fechaTexto(ejercicio.fechaInicio),
        fechaTexto(ejercicio.fechaFin),
        acceso,
        "posterior-cierre",
      ),
      ejercicio.empresa.tipoContribuyente,
      estado.detalleIsr,
    );
    if (!vista) {
      throw new ReglaCierreAnualError("El ejercicio no tiene saldos de resultado que requieran una partida.");
    }
    const idsCuenta = new Map(
      (
        await this.cuentasCierre(
          empresaId,
          vista.lineas.map((linea) => linea.codigo),
        )
      ).map((cuenta) => [cuenta.codigo, cuenta.id]),
    );
    const sucursal = await this.tx.sucursal.findFirst({
      where: { empresaId, esMatriz: true, activa: true },
      select: { id: true },
    });
    if (!sucursal)
      throw new ReglaCierreAnualError("La empresa no tiene una casa matriz activa para el cierre.");

    try {
      const partida = await this.tx.partida.create({
        data: {
          empresaId,
          sucursalId: sucursal.id,
          fecha: ejercicio.fechaFin,
          tipo: "cierre",
          concepto: `Partida de cierre anual, ejercicio ${anio}`,
          origen: "cierre_anual",
          origenId: ejercicio.id,
          detalles: {
            create: vista.lineas.map((linea, orden) => {
              const cuentaId = idsCuenta.get(linea.codigo);
              if (!cuentaId)
                throw new ReglaCierreAnualError(`Falta la cuenta ${linea.codigo} para el cierre anual.`);
              return {
                empresaId,
                cuentaId,
                debe: linea.debe,
                haber: linea.haber,
                orden,
              };
            }),
          },
        },
        include: {
          detalles: {
            orderBy: { orden: "asc" },
            select: { debe: true, haber: true, cuenta: { select: { codigo: true, nombre: true } } },
          },
        },
      });
      return aPartidaAnual(partida);
    } catch (error) {
      if (esDuplicado(error))
        throw new ConflictoCierreAnualError("Ya existe una partida activa de cierre anual.");
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaCierreAnualError(regla);
      throw error;
    }
  }

  async confirmarCierre(empresaId: string, anio: number, acceso: AccesoCierreAnual): Promise<void> {
    if (!acceso.todasSucursales) throw new AlcanceCierreAnualIncompletoError();
    const bloqueado = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM ejercicios
      WHERE empresa_id = ${empresaId}::uuid AND anio = ${anio}
      FOR UPDATE`;
    if (bloqueado.length === 0) throw new EjercicioCierreAnualNoEncontradoError();
    const ejercicio = await this.ejercicio(empresaId, anio);
    if (ejercicio.estado === "cerrado") return;
    const cierre = await this.partidaAnual(empresaId, "cierre_anual", ejercicio.id);
    if (!cierre || cierre.estado !== "contabilizada") {
      throw new ConflictoCierreAnualError(
        "Contabilice la partida de cierre anual antes de confirmar el ejercicio.",
      );
    }
    const diciembre = ejercicio.periodos.find((periodo) => periodo.mes === 12);
    if (!diciembre || diciembre.estado !== "abierto") {
      throw new ConflictoCierreAnualError(
        "El período de diciembre no está disponible para finalizar el cierre.",
      );
    }
    const idsPeriodo = ejercicio.periodos.map((periodo) => periodo.id);
    const borradores = await this.tx.partida.count({
      where: {
        empresaId,
        periodoId: { in: idsPeriodo },
        estado: "borrador",
        ...(acceso.todasSucursales ? {} : { sucursalId: { in: [...acceso.sucursales] } }),
      },
    });
    if (borradores > 0) {
      throw new ConflictoCierreAnualError(
        "Contabilice o resuelva todas las partidas en borrador del ejercicio.",
      );
    }
    if (ejercicio.periodos.some((periodo) => periodo.mes < 12 && periodo.estado !== "cerrado")) {
      throw new ConflictoCierreAnualError(
        "Cierre los períodos de enero a noviembre antes de confirmar el ejercicio.",
      );
    }

    try {
      await this.tx.periodo.update({ where: { id: diciembre.id }, data: { estado: "cerrado" } });
      await this.tx.ejercicio.update({ where: { id: ejercicio.id }, data: { estado: "cerrado" } });
    } catch (error) {
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaCierreAnualError(regla);
      throw error;
    }
  }

  async crearPartidaReapertura(
    empresaId: string,
    anio: number,
    acceso: AccesoCierreAnual,
  ): Promise<PartidaAnualVista> {
    if (!acceso.todasSucursales) throw new AlcanceCierreAnualIncompletoError();
    const bloqueado = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM ejercicios
      WHERE empresa_id = ${empresaId}::uuid AND anio = ${anio}
      FOR UPDATE`;
    if (bloqueado.length === 0) throw new EjercicioCierreAnualNoEncontradoError();
    const ejercicio = await this.ejercicio(empresaId, anio);
    if (ejercicio.estado !== "cerrado") {
      throw new ConflictoCierreAnualError(
        "Confirme el cierre anual antes de generar la partida de reapertura.",
      );
    }
    const existente = await this.partidaAnual(empresaId, "reapertura_ejercicio", ejercicio.id);
    if (existente) return aPartidaAnual(existente);
    const cierre = await this.partidaAnual(empresaId, "cierre_anual", ejercicio.id);
    if (!cierre || cierre.estado !== "contabilizada") {
      throw new ConflictoCierreAnualError("La partida de cierre anual debe estar contabilizada.");
    }

    const siguiente = await this.tx.ejercicio.findUnique({
      where: { empresaId_anio: { empresaId, anio: anio + 1 } },
      include: { periodos: { where: { mes: 1 } } },
    });
    if (!siguiente || siguiente.estado !== "abierto") throw new EjercicioSiguienteNoEncontradoError();
    const primerPeriodo = siguiente.periodos[0];
    if (!primerPeriodo || primerPeriodo.estado !== "abierto") {
      throw new ConflictoCierreAnualError("El primer período del ejercicio siguiente debe estar abierto.");
    }

    const filas = await new UnidadPrisma(this.tx).saldos({
      empresaId,
      tipo: "posterior-cierre",
      desde: fechaTexto(ejercicio.fechaInicio),
      hasta: fechaTexto(ejercicio.fechaFin),
      inicioEjercicio: fechaTexto(ejercicio.fechaInicio),
      sucursales: null,
    });
    const lineas = this.lineasReapertura(filas);
    const idsCuenta = new Map(
      (
        await this.cuentasCierre(
          empresaId,
          lineas.map((linea) => linea.codigo),
        )
      ).map((cuenta) => [cuenta.codigo, cuenta.id]),
    );
    const sucursal = await this.tx.sucursal.findFirst({
      where: { empresaId, esMatriz: true, activa: true },
      select: { id: true },
    });
    if (!sucursal)
      throw new ReglaCierreAnualError("La empresa no tiene una casa matriz activa para la reapertura.");

    try {
      const partida = await this.tx.partida.create({
        data: {
          empresaId,
          sucursalId: sucursal.id,
          fecha: primerPeriodo.fechaInicio,
          tipo: "reapertura",
          concepto: `Partida de reapertura del ejercicio ${anio + 1}`,
          origen: "reapertura_ejercicio",
          origenId: ejercicio.id,
          detalles: {
            create: lineas.map((linea, orden) => {
              const cuentaId = idsCuenta.get(linea.codigo);
              if (!cuentaId)
                throw new ReglaCierreAnualError(`Falta la cuenta ${linea.codigo} para la reapertura.`);
              return {
                empresaId,
                cuentaId,
                debe: linea.debe,
                haber: linea.haber,
                orden,
              };
            }),
          },
        },
        include: {
          detalles: {
            orderBy: { orden: "asc" },
            select: { debe: true, haber: true, cuenta: { select: { codigo: true, nombre: true } } },
          },
        },
      });
      return aPartidaAnual(partida);
    } catch (error) {
      if (esDuplicado(error))
        throw new ConflictoCierreAnualError("Ya existe una partida activa de reapertura.");
      const regla = mensajeDeRegla(error);
      if (regla) throw new ReglaCierreAnualError(regla);
      throw error;
    }
  }
}

@Injectable()
export class RepositorioCierreAnualPrisma implements RepositorioCierreAnual {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadCierreAnual) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrismaCierreAnual(tx)));
  }
}
