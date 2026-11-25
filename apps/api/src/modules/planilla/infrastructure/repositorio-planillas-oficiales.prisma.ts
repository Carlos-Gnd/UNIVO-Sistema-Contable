import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type {
  PresentarPlanillaOficial,
  PresentacionPlanillaOficialVista,
  ResultadoPlanillasOficialesVista,
  TipoPlanillaOficial,
} from "@contable/shared";
import { Dinero } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import {
  EmpresaPlanillaOficialNoEncontradaError,
  SinAccesoCompletoPlanillaError,
  SinDatosPlanillaOficialError,
  type RepositorioPlanillasOficiales,
} from "../domain/planillas-oficiales.js";

interface AccesoFila {
  todas_sucursales: boolean;
  permisos: string[];
}

function fechaPeriodo(periodo: string): Date {
  return new Date(`${periodo}-01T00:00:00.000Z`);
}

function aPresentacion(tipo: TipoPlanillaOficial, presentadaEn: Date, presentadaPor: string) {
  return { tipo, presentadaEn: presentadaEn.toISOString(), presentadaPor };
}

async function accesoCompleto(tx: Tx, usuarioId: string, empresaId: string, permiso: string): Promise<void> {
  const [acceso] = await tx.$queryRaw<AccesoFila[]>`
    SELECT m.todas_sucursales,
           ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                 WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id) AS permisos
    FROM membresias m
    JOIN usuarios u ON u.id = m.usuario_id AND u.activo
    JOIN empresas e ON e.id = m.empresa_id AND e.activa
    WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa
  `;
  if (!acceso) throw new EmpresaPlanillaOficialNoEncontradaError();
  if (!acceso.permisos.includes(permiso)) throw new SinAccesoCompletoPlanillaError();
  if (!acceso.todas_sucursales) throw new SinAccesoCompletoPlanillaError();
}

function sumar(valores: readonly string[]): string {
  return Dinero.sumar(valores).aTexto();
}

function total(laboral: string, patronal: string): string {
  return Dinero.de(laboral).mas(patronal).aTexto();
}

@Injectable()
export class RepositorioPlanillasOficialesPrisma implements RepositorioPlanillasOficiales {
  constructor(private readonly baseDatos: BaseDatos) {}

  consultar(
    usuarioId: string,
    empresaId: string,
    periodo: string,
  ): Promise<ResultadoPlanillasOficialesVista> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      await accesoCompleto(tx, usuarioId, empresaId, "planilla.ver");
      const fecha = fechaPeriodo(periodo);
      const filas = await tx.planillaCalculada.findMany({
        where: { empresaId, periodo: fecha },
        orderBy: [{ apellidos: "asc" }, { nombres: "asc" }, { dui: "asc" }],
      });
      const registros = await tx.presentacionPlanilla.findMany({
        where: { empresaId, periodo: fecha },
        include: { usuario: { select: { nombre: true } } },
      });
      const empleados = filas.map((fila) => ({
        empleadoId: fila.empleadoId,
        nombres: fila.nombres,
        apellidos: fila.apellidos,
        nombreCompleto: `${fila.nombres} ${fila.apellidos}`,
        dui: fila.dui,
        numeroIsss: fila.numeroIsss,
        nup: fila.nup,
        salarioCotizable: fila.salarioCotizable.toFixed(2),
        isssLaboral: fila.isssLaboral.toFixed(2),
        isssPatronal: fila.isssPatronal.toFixed(2),
        afpLaboral: fila.afpLaboral.toFixed(2),
        afpPatronal: fila.afpPatronal.toFixed(2),
      }));
      const isssLaboral = sumar(empleados.map((empleado) => empleado.isssLaboral));
      const isssPatronal = sumar(empleados.map((empleado) => empleado.isssPatronal));
      const afpLaboral = sumar(empleados.map((empleado) => empleado.afpLaboral));
      const afpPatronal = sumar(empleados.map((empleado) => empleado.afpPatronal));
      const presentaciones: ResultadoPlanillasOficialesVista["presentaciones"] = {};
      for (const registro of registros) {
        presentaciones[registro.tipo] = aPresentacion(
          registro.tipo,
          registro.presentadaEn,
          registro.usuario.nombre,
        );
      }
      return {
        periodo,
        empleados,
        totales: {
          isss: {
            salarioCotizable: sumar(empleados.map((empleado) => empleado.salarioCotizable)),
            laboral: isssLaboral,
            patronal: isssPatronal,
            total: total(isssLaboral, isssPatronal),
          },
          afp: {
            salarioCotizable: sumar(empleados.map((empleado) => empleado.salarioCotizable)),
            laboral: afpLaboral,
            patronal: afpPatronal,
            total: total(afpLaboral, afpPatronal),
          },
        },
        presentaciones,
      };
    });
  }

  presentar(
    usuarioId: string,
    empresaId: string,
    datos: PresentarPlanillaOficial,
  ): Promise<PresentacionPlanillaOficialVista> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      await accesoCompleto(tx, usuarioId, empresaId, "planilla.calcular");
      const periodo = fechaPeriodo(datos.periodo);
      const hayCalculos = await tx.planillaCalculada.count({ where: { empresaId, periodo } });
      if (hayCalculos === 0) throw new SinDatosPlanillaOficialError();
      const registro = await tx.presentacionPlanilla.create({
        data: { empresaId, periodo, tipo: datos.tipo, presentadaPor: usuarioId },
        include: { usuario: { select: { nombre: true } } },
      });
      return aPresentacion(registro.tipo, registro.presentadaEn, registro.usuario.nombre);
    });
  }
}
