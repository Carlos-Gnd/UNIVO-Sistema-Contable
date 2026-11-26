import { Inject, Injectable } from "@nestjs/common";
import {
  Dinero,
  cuadroDepreciacion,
  validarPartida,
  type CuadroActivo,
  type CuentaInfo,
  type ResultadoDepreciacion,
  type VistaDepreciacionMes,
} from "@contable/shared";
import {
  ActivoNoEncontradoError,
  EmpresaNoEncontradaError,
  PERMISO_VER_ACTIVOS,
  PartidaInvalidaError,
  SinPermisoActivoFijoError,
} from "../domain/activo-fijo.js";
import {
  DepreciacionBloqueadaError,
  MesFuturoError,
  RELOJ,
  type Reloj,
  ORIGEN_DEPRECIACION,
  PERMISO_GENERAR_DEPRECIACION,
  SinDepreciacionPendienteError,
  partidasDeDepreciacion,
  planearDepreciacion,
  primerDiaDelMes,
  type PlanActivo,
} from "../domain/depreciacion.js";
import {
  puedeUsarSucursal,
  REPOSITORIO_ACTIVO_FIJO,
  type AccesoActivos,
  type RepositorioActivoFijo,
  type UnidadActivoFijo,
} from "../domain/repositorio-activo-fijo.js";

async function accesoCon(unidad: UnidadActivoFijo, usuarioId: string, empresaId: string, permiso: string) {
  const a = await unidad.acceso(usuarioId, empresaId);
  if (!a) throw new EmpresaNoEncontradaError();
  if (!a.permisos.has(permiso)) throw new SinPermisoActivoFijoError();
  return a;
}

const sucursalesVisibles = (a: AccesoActivos) => (a.todasSucursales ? null : a.sucursales);

/** Datos de las cuentas y sucursales de las partidas previstas, para mostrarlas y validarlas. */
async function detalleDeCuentas(unidad: UnidadActivoFijo, empresaId: string, planes: readonly PlanActivo[]) {
  const ids = [
    ...new Set(planes.flatMap(({ activo }) => [activo.cuentaGasto.id, activo.cuentaDepreciacion.id])),
  ];
  return new Map((await unidad.cuentasPorId(empresaId, ids)).map((c) => [c.id, c]));
}

/**
 * Depreciación mensual automática (HU-82): calcula la cuota de cada activo en línea recta, la muestra para
 * confirmarla y, al confirmar, crea y contabiliza una partida de ajuste por sucursal. Todo ocurre en una
 * transacción: si una partida es rechazada (período cerrado, por ejemplo) no queda ninguna cuota registrada.
 */
@Injectable()
export class DepreciarActivos {
  constructor(
    @Inject(REPOSITORIO_ACTIVO_FIJO) private readonly repositorio: RepositorioActivoFijo,
    @Inject(RELOJ) private readonly hoy: Reloj,
  ) {}

  /** Vista previa del mes: la situación de cada activo y las partidas que se generarían. */
  consultar(usuarioId: string, empresaId: string, mes: string): Promise<VistaDepreciacionMes> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const a = await accesoCon(unidad, usuarioId, empresaId, PERMISO_VER_ACTIVOS);
      const activos = await unidad.listar(empresaId, sucursalesVisibles(a));
      const plan = planearDepreciacion(activos, mes);
      const pendientes = plan.filter((p) => p.fila.estado === "pendiente");
      const cuentas = await detalleDeCuentas(unidad, empresaId, pendientes);
      const sucursales = new Map(activos.map((x) => [x.sucursalId, x.sucursalNombre]));

      const partidas = partidasDeDepreciacion(pendientes, mes).map((p) => ({
        sucursalId: p.sucursalId,
        sucursalNombre: sucursales.get(p.sucursalId) ?? "",
        fecha: p.fecha,
        concepto: p.concepto,
        total: p.total,
        lineas: p.lineas.map((l) => ({
          cuentaId: l.cuentaId,
          codigo: cuentas.get(l.cuentaId)?.codigo ?? "",
          nombre: cuentas.get(l.cuentaId)?.nombre ?? "",
          debe: Dinero.de(l.debe).aTexto(),
          haber: Dinero.de(l.haber).aTexto(),
        })),
      }));
      return {
        mes,
        activos: plan.map((p) => p.fila),
        partidas,
        totalPendiente: Dinero.sumar(pendientes.map((p) => p.fila.cuota)).aTexto(),
      };
    });
  }

  /** Genera y contabiliza la depreciación del mes. Requiere ajustes.generar (contador y administrador). */
  generar(usuarioId: string, empresaId: string, mes: string): Promise<ResultadoDepreciacion> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const a = await accesoCon(unidad, usuarioId, empresaId, PERMISO_GENERAR_DEPRECIACION);
      if (mes > this.hoy().slice(0, 7)) throw new MesFuturoError(mes);
      // Los activos quedan retenidos: dos generaciones simultáneas del mismo mes se ejecutan una tras otra
      const activos = await unidad.activosDepreciables(empresaId, sucursalesVisibles(a));
      const plan = planearDepreciacion(activos, mes);

      const bloqueados = plan.filter((p) => p.fila.estado === "bloqueada");
      if (bloqueados.length > 0) throw new DepreciacionBloqueadaError(bloqueados.map((b) => b.fila));
      const pendientes = plan.filter((p) => p.fila.estado === "pendiente");
      if (pendientes.length === 0) throw new SinDepreciacionPendienteError(mes);

      const cuentas = await detalleDeCuentas(unidad, empresaId, pendientes);
      const info = new Map<string, CuentaInfo>(
        [...cuentas].map(([id, c]) => [
          id,
          { id, codigo: c.codigo, activa: c.activa, imputable: c.imputable },
        ]),
      );

      const resultado: ResultadoDepreciacion = { mes, partidas: [], total: "0.00" };
      for (const p of partidasDeDepreciacion(pendientes, mes)) {
        const r = validarPartida(p.lineas, info);
        if (!r.puedeContabilizarse) {
          throw new PartidaInvalidaError(r.errores[0]?.mensaje ?? "La partida de depreciación no cuadra.");
        }
        const partida = await unidad.contabilizarPartida(empresaId, {
          sucursalId: p.sucursalId,
          fecha: p.fecha,
          concepto: p.concepto,
          origen: ORIGEN_DEPRECIACION,
          origenId: null,
          tipo: "ajuste",
          lineas: p.lineas,
        });
        for (const c of p.cuotas) {
          await unidad.registrarDepreciacion(empresaId, usuarioId, {
            activoId: c.activoId,
            mes: primerDiaDelMes(mes),
            cuota: c.cuota,
            acumulada: c.acumulada,
            partidaId: partida.id,
          });
        }
        resultado.partidas.push({ sucursalId: p.sucursalId, partida, total: p.total });
      }
      resultado.total = Dinero.sumar(resultado.partidas.map((x) => x.total)).aTexto();
      return resultado;
    });
  }

  /** Cuadro de depreciación de un activo: cada mes de su vida útil y cuáles ya tienen partida. */
  cuadro(usuarioId: string, empresaId: string, activoId: string): Promise<CuadroActivo> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      const a = await accesoCon(unidad, usuarioId, empresaId, PERMISO_VER_ACTIVOS);
      const activo = await unidad.obtener(empresaId, activoId);
      if (!activo || !puedeUsarSucursal(a, activo.sucursalId)) throw new ActivoNoEncontradoError();
      const generadas = await unidad.partidasDeDepreciacion(empresaId, activoId);
      return {
        activo,
        filas: cuadroDepreciacion(activo).map((f) => ({
          ...f,
          // También están generados los meses anteriores al último depreciado: su partida ya existía al registrar el activo
          estado:
            generadas.has(f.mes) ||
            (activo.ultimoMesDepreciado !== null && f.mes <= activo.ultimoMesDepreciado)
              ? ("generada" as const)
              : ("pendiente" as const),
          partidaId: generadas.get(f.mes) ?? null,
        })),
      };
    });
  }
}
