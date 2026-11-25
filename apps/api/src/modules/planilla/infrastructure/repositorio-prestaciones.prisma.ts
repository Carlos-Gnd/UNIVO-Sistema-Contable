import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { CalcularPrestaciones } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import {
  CuentaPrestacionesInvalidaError,
  EmpresaPrestacionesNoEncontradaError,
  SinPermisoPrestacionesError,
  SucursalPrestacionesNoAutorizadaError,
  type EmpleadoParaPrestaciones,
  type PreparacionPrestaciones,
  type RepositorioPrestaciones,
} from "../domain/prestaciones.js";
import type { CuentaParaPlanilla } from "../domain/calculo-planilla.js";
import { leerCuentasGastoPorArea } from "./cuentas-gasto-area.prisma.js";

const CODIGOS_PROVISION = ["210705", "210706", "210707"];
const CODIGOS_GASTO_AREA = ["4201", "4202"];

interface AccesoFila {
  todas_sucursales: boolean;
  sucursales: string[];
  permisos: string[];
}

async function leerCuentas(tx: Tx, empresaId: string): Promise<CuentaParaPlanilla[]> {
  return tx.$queryRaw<CuentaParaPlanilla[]>`
    SELECT c.id::text, c.codigo, c.nombre, c.activa,
           NOT EXISTS (
             SELECT 1 FROM cuentas h
             WHERE h.empresa_id = c.empresa_id AND h.cuenta_padre_id = c.id
           ) AS imputable
    FROM cuentas c
    WHERE c.empresa_id = ${empresaId}::uuid
      AND c.codigo = ANY(${[...CODIGOS_PROVISION, ...CODIGOS_GASTO_AREA]}::text[])
  `;
}

function fechaTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function ultimoDia(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return new Date(Date.UTC(anio!, mes!, 0)).toISOString().slice(0, 10);
}

@Injectable()
export class RepositorioPrestacionesPrisma implements RepositorioPrestaciones {
  constructor(private readonly baseDatos: BaseDatos) {}

  preparar(
    usuarioId: string,
    empresaId: string,
    datos: CalcularPrestaciones,
  ): Promise<PreparacionPrestaciones> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      const [acceso] = await tx.$queryRaw<AccesoFila[]>`
        SELECT m.todas_sucursales,
               ARRAY(SELECT ms.sucursal_id::text FROM membresia_sucursales ms WHERE ms.membresia_id = m.id)
                 AS sucursales,
               ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                     WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id) AS permisos
        FROM membresias m
        JOIN usuarios u ON u.id = m.usuario_id AND u.activo
        WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa
      `;
      if (!acceso) throw new EmpresaPrestacionesNoEncontradaError();
      if (!acceso.permisos.includes("planilla.calcular")) throw new SinPermisoPrestacionesError();
      if (!acceso.todas_sucursales && !acceso.sucursales.includes(datos.sucursalId)) {
        throw new SucursalPrestacionesNoAutorizadaError();
      }

      const sucursal = await tx.sucursal.findFirst({
        where: { id: datos.sucursalId, empresaId, activa: true },
        select: { nombre: true },
      });
      if (!sucursal) throw new EmpresaPrestacionesNoEncontradaError();

      const cuentas = await leerCuentas(tx, empresaId);
      const cuentasPorCodigo = new Map(cuentas.map((cuenta) => [cuenta.codigo, cuenta]));
      for (const codigo of CODIGOS_PROVISION) {
        const cuenta = cuentasPorCodigo.get(codigo);
        if (!cuenta?.activa || !cuenta.imputable) throw new CuentaPrestacionesInvalidaError(codigo);
      }

      const filas = await tx.empleado.findMany({
        where: {
          empresaId,
          sucursalId: datos.sucursalId,
          activo: true,
          fechaIngreso: { lte: new Date(`${datos.fechaCalculo}T00:00:00.000Z`) },
        },
        orderBy: [{ puesto: "asc" }, { dui: "asc" }],
      });
      const cuentasGastoPorArea = await leerCuentasGastoPorArea(
        tx,
        empresaId,
        filas.map((empleado) => empleado.area),
        datos.cuentasGastoPorArea,
        cuentasPorCodigo,
        (codigo) => new CuentaPrestacionesInvalidaError(codigo),
      );
      const periodo = datos.fechaCalculo.slice(0, 7);
      const fechaPartida = ultimoDia(periodo);
      const partidaExistente = await tx.partida.findFirst({
        where: {
          empresaId,
          sucursalId: datos.sucursalId,
          fecha: new Date(`${fechaPartida}T00:00:00.000Z`),
          origen: "prestaciones",
          estado: { not: "anulada" },
        },
        select: { id: true, estado: true },
      });

      const empleados: EmpleadoParaPrestaciones[] = filas.map((empleado) => ({
        empleadoId: empleado.id,
        dui: empleado.dui,
        puesto: empleado.puesto,
        area: empleado.area,
        fechaIngreso: fechaTexto(empleado.fechaIngreso),
        salario: empleado.salario.toFixed(2),
      }));
      return {
        fechaCalculo: datos.fechaCalculo,
        periodo,
        sucursalId: datos.sucursalId,
        sucursal: sucursal.nombre,
        empleados,
        cuentas: cuentasPorCodigo,
        cuentasGastoPorArea,
        partidaExistente: partidaExistente
          ? { id: partidaExistente.id, estado: partidaExistente.estado }
          : null,
      };
    });
  }
}
