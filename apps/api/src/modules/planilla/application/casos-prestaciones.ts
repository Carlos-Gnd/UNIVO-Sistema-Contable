import { Inject, Injectable } from "@nestjs/common";
import {
  calcularPrestacionesEmpleado,
  Dinero,
  resumirPrestaciones,
  type CalcularPrestaciones,
  type CrearPartida,
  type EmpleadoPrestacionesVista,
  type ResultadoCalculoPrestacionesVista,
  codigoGastoPorArea,
  normalizarAreaGasto,
} from "@contable/shared";
import { PartidasBorrador } from "../../contabilidad/application/partidas-borrador.js";
import type { CuentaParaPlanilla } from "../domain/calculo-planilla.js";
import {
  DatosPrestacionesInvalidosError,
  PartidaPrestacionesNoEditableError,
  REPOSITORIO_PRESTACIONES,
  SinEmpleadosPrestacionesError,
  type PreparacionPrestaciones,
  type RepositorioPrestaciones,
} from "../domain/prestaciones.js";

function finDeMes(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio!, mes!, 0)).getUTCDate().toString().padStart(2, "0");
  return `${periodo}-${ultimoDia}`;
}

function linea(cuenta: CuentaParaPlanilla, monto: string, lado: "debe" | "haber", concepto: string) {
  return {
    cuentaId: cuenta.id,
    debe: lado === "debe" ? monto : "0.00",
    haber: lado === "haber" ? monto : "0.00",
    concepto,
  };
}

function sumar(
  empleados: readonly EmpleadoPrestacionesVista[],
  campo: keyof EmpleadoPrestacionesVista,
): string {
  return Dinero.sumar(empleados.map((empleado) => empleado[campo] as string)).aTexto();
}

function crearLineas(preparacion: PreparacionPrestaciones, empleados: readonly EmpleadoPrestacionesVista[]) {
  const cuentas = preparacion.cuentas;
  const gastosPorCuenta = new Map<
    string,
    { cuenta: CuentaParaPlanilla; empleados: EmpleadoPrestacionesVista[] }
  >();
  for (const empleado of empleados) {
    const codigo = codigoGastoPorArea(empleado.area);
    const clave = normalizarAreaGasto(empleado.area) || "__sin_area__";
    const cuenta = codigo ? cuentas.get(codigo) : preparacion.cuentasGastoPorArea.get(clave);
    if (!cuenta)
      throw new DatosPrestacionesInvalidosError("Seleccione una cuenta para cada área sin clasificación.");
    const grupo = gastosPorCuenta.get(cuenta.id) ?? { cuenta, empleados: [] };
    grupo.empleados.push(empleado);
    gastosPorCuenta.set(cuenta.id, grupo);
  }
  const gastos = [...gastosPorCuenta.values()]
    .sort((a, b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo))
    .map(({ cuenta, empleados: grupo }) =>
      linea(
        cuenta,
        Dinero.sumar(
          grupo.map((empleado) =>
            Dinero.de(empleado.provisionVacacionesMensual)
              .mas(empleado.provisionAguinaldoMensual)
              .mas(empleado.provisionIndemnizacionMensual)
              .aTexto(),
          ),
        ).aTexto(),
        "debe",
        "Provisión mensual de prestaciones laborales",
      ),
    );
  const lineas = [
    ...gastos,
    linea(
      cuentas.get("210705")!,
      sumar(empleados, "provisionVacacionesMensual"),
      "haber",
      "Provisión de vacaciones por pagar",
    ),
    linea(
      cuentas.get("210706")!,
      sumar(empleados, "provisionAguinaldoMensual"),
      "haber",
      "Provisión de aguinaldo por pagar",
    ),
    linea(
      cuentas.get("210707")!,
      sumar(empleados, "provisionIndemnizacionMensual"),
      "haber",
      "Provisión de indemnización por pagar",
    ),
  ];
  return lineas.filter((item) => item.debe !== "0.00" || item.haber !== "0.00");
}

@Injectable()
export class CasosPrestaciones {
  constructor(
    @Inject(REPOSITORIO_PRESTACIONES)
    private readonly repositorio: RepositorioPrestaciones,
    private readonly partidas: PartidasBorrador,
  ) {}

  async calcular(
    usuarioId: string,
    empresaId: string,
    datos: CalcularPrestaciones,
  ): Promise<ResultadoCalculoPrestacionesVista> {
    const preparacion = await this.repositorio.preparar(usuarioId, empresaId, datos);
    if (preparacion.empleados.length === 0) throw new SinEmpleadosPrestacionesError();

    let empleados: EmpleadoPrestacionesVista[];
    try {
      empleados = preparacion.empleados.map((empleado) =>
        calcularPrestacionesEmpleado(empleado, preparacion.fechaCalculo),
      );
    } catch (error) {
      throw new DatosPrestacionesInvalidosError(
        error instanceof Error ? error.message : "No se pudieron calcular las prestaciones.",
      );
    }

    const empleadosVista = empleados;
    const resumen = resumirPrestaciones(empleadosVista);
    const lineas = crearLineas(preparacion, empleados);
    if (lineas.length === 0 || Dinero.de(resumen.provisionMensualTotal).esCero()) {
      throw new DatosPrestacionesInvalidosError("No hay importes que registrar en la provisión mensual.");
    }
    const fecha = finDeMes(preparacion.periodo);
    const datosPartida: CrearPartida = {
      sucursalId: preparacion.sucursalId,
      fecha,
      tipo: "operacion",
      concepto: `Provisión de prestaciones del período ${preparacion.periodo}`,
      lineas,
    };
    if (preparacion.partidaExistente && preparacion.partidaExistente.estado !== "borrador") {
      throw new PartidaPrestacionesNoEditableError(preparacion.partidaExistente.estado);
    }
    const partida = preparacion.partidaExistente
      ? await this.partidas.editar(usuarioId, empresaId, preparacion.partidaExistente.id, datosPartida)
      : await this.partidas.crear(usuarioId, empresaId, datosPartida, "prestaciones");

    return {
      fechaCalculo: preparacion.fechaCalculo,
      periodo: preparacion.periodo,
      sucursalId: preparacion.sucursalId,
      empleados: empleadosVista,
      resumen,
      partida,
    };
  }
}
