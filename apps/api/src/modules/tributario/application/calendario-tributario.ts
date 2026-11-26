import { Inject, Injectable } from "@nestjs/common";
import {
  DIAS_DE_ALERTA,
  type AlertasTributarias,
  type CalendarioTributario,
  type ConsultaCalendario,
  type Obligacion,
  type Vencimiento,
} from "@contable/shared";
import {
  EmpresaNoEncontradaError,
  type Presentacion,
  PERMISO_MARCAR_PRESENTADA,
  PERMISO_VER_CALENDARIO,
  SinPermisoCalendarioError,
  alertasDeVencimientos,
  hoyEnElSalvador,
  vencimientosDelPeriodo,
  vencimientosEnRango,
  MESES_ATRAS_EN_ALERTAS,
} from "../domain/calendario.js";
import {
  REPOSITORIO_CALENDARIO,
  type RepositorioCalendario,
  type UnidadCalendario,
} from "../domain/repositorio-calendario.js";

async function exigir(unidad: UnidadCalendario, usuarioId: string, empresaId: string, permiso: string) {
  const a = await unidad.acceso(usuarioId, empresaId);
  if (!a) throw new EmpresaNoEncontradaError();
  if (!a.permisos.has(permiso)) throw new SinPermisoCalendarioError();
}

const restarMeses = (mes: string, meses: number) => {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) - meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};

/** Casos de uso del calendario tributario (HU-52): consultar, alertar y marcar como presentado. */
@Injectable()
export class ServicioCalendarioTributario {
  constructor(@Inject(REPOSITORIO_CALENDARIO) private readonly repositorio: RepositorioCalendario) {}

  consultar(
    usuarioId: string,
    empresaId: string,
    consulta: ConsultaCalendario,
  ): Promise<CalendarioTributario> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(unidad, usuarioId, empresaId, PERMISO_VER_CALENDARIO);
      const hoy = consulta.hoy ?? hoyEnElSalvador();
      const presentaciones = await unidad.presentaciones(
        empresaId,
        restarMeses(consulta.desde.slice(0, 7), 1),
        restarMeses(consulta.hasta.slice(0, 7), 1),
      );
      return { hoy, vencimientos: vencimientosEnRango(consulta.desde, consulta.hasta, presentaciones, hoy) };
    });
  }

  alertas(usuarioId: string, empresaId: string, hoyDado?: string): Promise<AlertasTributarias> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(unidad, usuarioId, empresaId, PERMISO_VER_CALENDARIO);
      const hoy = hoyDado ?? hoyEnElSalvador();
      const presentaciones = await unidad.presentaciones(
        empresaId,
        restarMeses(hoy.slice(0, 7), MESES_ATRAS_EN_ALERTAS),
        hoy.slice(0, 7),
      );
      return { hoy, diasDeAlerta: DIAS_DE_ALERTA, alertas: alertasDeVencimientos(presentaciones, hoy) };
    });
  }

  /** Marca el vencimiento como presentado; requiere declaraciones.generar (contador y administrador). */
  marcar(
    usuarioId: string,
    empresaId: string,
    obligacion: Obligacion,
    periodo: string,
    nota: string | null,
  ): Promise<Vencimiento> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(unidad, usuarioId, empresaId, PERMISO_MARCAR_PRESENTADA);
      const presentacion = await unidad.marcar(empresaId, usuarioId, obligacion, periodo, nota);
      const mapa = new Map([[`${obligacion}:${periodo}`, presentacion]]);
      return vencimientoDe(obligacion, periodo, mapa);
    });
  }

  /** Quita la marca de presentado (por si se marcó por error). */
  desmarcar(
    usuarioId: string,
    empresaId: string,
    obligacion: Obligacion,
    periodo: string,
  ): Promise<Vencimiento> {
    return this.repositorio.enTransaccion(usuarioId, async (unidad) => {
      await exigir(unidad, usuarioId, empresaId, PERMISO_MARCAR_PRESENTADA);
      await unidad.desmarcar(empresaId, obligacion, periodo);
      return vencimientoDe(obligacion, periodo, new Map());
    });
  }
}

function vencimientoDe(
  obligacion: Obligacion,
  periodo: string,
  presentaciones: ReadonlyMap<string, Presentacion>,
): Vencimiento {
  const v = vencimientosDelPeriodo(periodo, presentaciones, hoyEnElSalvador()).find(
    (x) => x.obligacion === obligacion,
  );
  if (!v) throw new Error(`Obligación desconocida: ${obligacion}`);
  return v;
}
