import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { CalcularPlanilla, ConfiguracionPlanillaVista } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import {
  ConfiguracionPlanillaNoEncontradaError,
  CuentaPlanillaInvalidaError,
  EmpresaPlanillaNoEncontradaError,
  PlanillaYaPresentadaError,
  SinPermisoCalculoPlanillaError,
  SucursalPlanillaNoAutorizadaError,
  type CuentaParaPlanilla,
  type PreparacionPlanilla,
  type RepositorioCalculoPlanilla,
} from "../domain/calculo-planilla.js";
import { leerCuentasGastoPorArea } from "./cuentas-gasto-area.prisma.js";

const CODIGOS_CUENTAS = ["210601", "210603", "210604", "210606", "210701", "210703", "2112"];
const CODIGOS_GASTO_AREA = ["4201", "4202"];

type CuentaFila = CuentaParaPlanilla;

interface AccesoFila {
  todas_sucursales: boolean;
  sucursales: string[];
  permisos: string[];
}

function fechaTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function textoDinero(valor: { toFixed(decimales: number): string }): string {
  return valor.toFixed(2);
}

function normalizarNit(valor: string): string {
  return valor.replace(/\D/g, "");
}

async function leerCuentas(tx: Tx, empresaId: string, codigos: string[]): Promise<CuentaFila[]> {
  return tx.$queryRaw<CuentaFila[]>`
    SELECT c.id::text, c.codigo, c.nombre, c.activa,
           NOT EXISTS (
             SELECT 1 FROM cuentas h
             WHERE h.empresa_id = c.empresa_id AND h.cuenta_padre_id = c.id
           ) AS imputable
    FROM cuentas c
    WHERE c.empresa_id = ${empresaId}::uuid AND c.codigo = ANY(${codigos}::text[])
  `;
}

function configuracionVista(fila: {
  id: string;
  vigenteDesde: Date;
  tasaIsssLaboral: { toFixed(decimales: number): string };
  tasaIsssPatronal: { toFixed(decimales: number): string };
  techoIsss: { toFixed(decimales: number): string };
  tasaAfpLaboral: { toFixed(decimales: number): string };
  tasaAfpPatronal: { toFixed(decimales: number): string };
  tramos: {
    desde: { toFixed(decimales: number): string };
    hasta: { toFixed(decimales: number): string } | null;
    porcentaje: { toFixed(decimales: number): string };
    cuotaFija: { toFixed(decimales: number): string };
  }[];
}): ConfiguracionPlanillaVista {
  return {
    id: fila.id,
    vigenteDesde: fechaTexto(fila.vigenteDesde),
    tasaIsssLaboral: textoDinero(fila.tasaIsssLaboral),
    tasaIsssPatronal: textoDinero(fila.tasaIsssPatronal),
    techoIsss: textoDinero(fila.techoIsss),
    tasaAfpLaboral: textoDinero(fila.tasaAfpLaboral),
    tasaAfpPatronal: textoDinero(fila.tasaAfpPatronal),
    tramos: fila.tramos.map((tramo) => ({
      desde: textoDinero(tramo.desde),
      hasta: tramo.hasta === null ? null : textoDinero(tramo.hasta),
      porcentaje: textoDinero(tramo.porcentaje),
      cuotaFija: textoDinero(tramo.cuotaFija),
    })),
  };
}

@Injectable()
export class RepositorioCalculoPlanillaPrisma implements RepositorioCalculoPlanilla {
  constructor(private readonly baseDatos: BaseDatos) {}

  preparar(usuarioId: string, empresaId: string, datos: CalcularPlanilla): Promise<PreparacionPlanilla> {
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
      if (!acceso) throw new EmpresaPlanillaNoEncontradaError();
      if (!acceso.permisos.includes("planilla.calcular")) throw new SinPermisoCalculoPlanillaError();
      if (!acceso.todas_sucursales && !acceso.sucursales.includes(datos.sucursalId)) {
        throw new SucursalPlanillaNoAutorizadaError();
      }

      const sucursal = await tx.sucursal.findFirst({
        where: { id: datos.sucursalId, empresaId, activa: true },
        select: { nombre: true },
      });
      if (!sucursal) throw new EmpresaPlanillaNoEncontradaError();

      const [anio, mes] = datos.periodo.split("-").map(Number);
      const fechaInicio = new Date(Date.UTC(anio!, mes! - 1, 1));
      const fechaFin = new Date(Date.UTC(anio!, mes!, 0));
      const empresa = await tx.empresa.findUnique({
        where: { id: empresaId, activa: true },
        select: { nit: true, tipoContribuyente: true },
      });
      if (!empresa) throw new EmpresaPlanillaNoEncontradaError();

      const configuracion = await tx.configuracionPlanilla.findFirst({
        where: { empresaId, vigenteDesde: { lte: fechaInicio } },
        orderBy: { vigenteDesde: "desc" },
        include: { tramos: { orderBy: { orden: "asc" } } },
      });
      if (!configuracion) throw new ConfiguracionPlanillaNoEncontradaError();
      const planillaPresentada = await tx.presentacionPlanilla.findFirst({
        where: { empresaId, periodo: fechaInicio },
        select: { id: true },
      });
      if (planillaPresentada) throw new PlanillaYaPresentadaError();
      const partidaExistente = await tx.partida.findFirst({
        where: { empresaId, sucursalId: datos.sucursalId, fecha: fechaFin, origen: "planilla" },
        select: { id: true, estado: true },
      });

      const filasEmpleados = await tx.empleado.findMany({
        where: {
          empresaId,
          sucursalId: datos.sucursalId,
          activo: true,
          fechaIngreso: { lte: fechaFin },
        },
        orderBy: [{ puesto: "asc" }, { dui: "asc" }],
      });
      const empleadosIncluidos =
        empresa.tipoContribuyente === "persona_natural"
          ? filasEmpleados.filter((empleado) => normalizarNit(empleado.nit) !== normalizarNit(empresa.nit))
          : filasEmpleados;

      const cuentas = await leerCuentas(tx, empresaId, [...CODIGOS_CUENTAS, ...CODIGOS_GASTO_AREA]);
      const porCodigo = new Map(cuentas.map((cuenta) => [cuenta.codigo, cuenta]));
      for (const codigo of CODIGOS_CUENTAS) {
        const cuenta = porCodigo.get(codigo);
        if (!cuenta?.activa || !cuenta.imputable) throw new CuentaPlanillaInvalidaError(codigo);
      }
      const cuentasGastoPorArea = await leerCuentasGastoPorArea(
        tx,
        empresaId,
        empleadosIncluidos.map((empleado) => empleado.area),
        datos.cuentasGastoPorArea,
        porCodigo,
        (codigo) => new CuentaPlanillaInvalidaError(codigo),
      );

      return {
        empleados: empleadosIncluidos.map((empleado) => ({
          empleadoId: empleado.id,
          sucursalId: empleado.sucursalId,
          nombres: empleado.nombres,
          apellidos: empleado.apellidos,
          numeroIsss: empleado.numeroIsss,
          nup: empleado.nup,
          dui: empleado.dui,
          nit: empleado.nit,
          puesto: empleado.puesto,
          area: empleado.area,
          salario: empleado.salario.toFixed(2),
        })),
        configuracion: configuracionVista(configuracion),
        cuentas: porCodigo,
        cuentasGastoPorArea,
        periodo: datos.periodo,
        sucursalId: datos.sucursalId,
        sucursal: sucursal.nombre,
        partidaExistente,
      };
    });
  }

  guardarCalculo(
    usuarioId: string,
    empresaId: string,
    periodo: string,
    sucursalId: string,
    partidaId: string,
    empleados: readonly import("@contable/shared").EmpleadoPlanillaVista[],
  ): Promise<void> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, async (tx) => {
      const fechaPeriodo = new Date(`${periodo}-01T00:00:00.000Z`);
      const ids = empleados.map((empleado) => empleado.empleadoId);
      await tx.planillaCalculada.deleteMany({
        where: {
          empresaId,
          sucursalId,
          periodo: fechaPeriodo,
          ...(ids.length > 0 ? { empleadoId: { notIn: ids } } : {}),
        },
      });
      for (const empleado of empleados) {
        await tx.planillaCalculada.upsert({
          where: {
            empresaId_periodo_empleadoId: {
              empresaId,
              periodo: fechaPeriodo,
              empleadoId: empleado.empleadoId,
            },
          },
          create: {
            empresaId,
            sucursalId,
            periodo: fechaPeriodo,
            partidaId,
            empleadoId: empleado.empleadoId,
            nombres: empleado.nombres,
            apellidos: empleado.apellidos,
            dui: empleado.dui,
            numeroIsss: empleado.numeroIsss,
            nup: empleado.nup,
            salarioCotizable: empleado.bruto,
            isssLaboral: empleado.isssLaboral,
            isssPatronal: empleado.isssPatronal,
            afpLaboral: empleado.afpLaboral,
            afpPatronal: empleado.afpPatronal,
          },
          update: {
            sucursalId,
            partidaId,
            nombres: empleado.nombres,
            apellidos: empleado.apellidos,
            dui: empleado.dui,
            numeroIsss: empleado.numeroIsss,
            nup: empleado.nup,
            salarioCotizable: empleado.bruto,
            isssLaboral: empleado.isssLaboral,
            isssPatronal: empleado.isssPatronal,
            afpLaboral: empleado.afpLaboral,
            afpPatronal: empleado.afpPatronal,
          },
        });
      }
    });
  }
}
