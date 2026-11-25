import { Inject, Injectable } from "@nestjs/common";
import {
  calcularEmpleadoPlanilla,
  Dinero,
  resumirPlanilla,
  type CalcularPlanilla,
  type CrearPartida,
  type EmpleadoPlanillaVista,
  type ResultadoCalculoPlanillaVista,
  codigoGastoPorArea,
  normalizarAreaGasto,
} from "@contable/shared";
import { PartidasBorrador } from "../../contabilidad/application/partidas-borrador.js";
import {
  DatosPlanillaInvalidosError,
  PartidaPlanillaNoEditableError,
  REPOSITORIO_CALCULO_PLANILLA,
  SinEmpleadosPlanillaError,
  type CuentaParaPlanilla,
  type PreparacionPlanilla,
  type RepositorioCalculoPlanilla,
} from "../domain/calculo-planilla.js";

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

function sumar(empleados: readonly EmpleadoPlanillaVista[], campo: keyof EmpleadoPlanillaVista): string {
  return Dinero.sumar(empleados.map((empleado) => empleado[campo] as string)).aTexto();
}

function crearLineas(preparacion: PreparacionPlanilla, empleados: EmpleadoPlanillaVista[]) {
  const codigos = preparacion.cuentas;
  const grupos = new Map<string, { cuenta: CuentaParaPlanilla; empleados: EmpleadoPlanillaVista[] }>();
  for (const empleado of empleados) {
    const codigo = codigoGastoPorArea(empleado.area);
    const clave = normalizarAreaGasto(empleado.area) || "__sin_area__";
    const cuenta = codigo ? codigos.get(codigo) : preparacion.cuentasGastoPorArea.get(clave);
    if (!cuenta)
      throw new DatosPlanillaInvalidosError("Seleccione una cuenta para cada área sin clasificación.");
    const grupo = grupos.get(cuenta.id) ?? { cuenta, empleados: [] };
    grupo.empleados.push(empleado);
    grupos.set(cuenta.id, grupo);
  }
  const gastos = [...grupos.values()]
    .sort((a, b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo))
    .flatMap(({ cuenta, empleados: grupo }) => [
      linea(cuenta, sumar(grupo, "bruto"), "debe", "Sueldos del período"),
      linea(cuenta, sumar(grupo, "isssPatronal"), "debe", "Aporte patronal ISSS"),
      linea(cuenta, sumar(grupo, "afpPatronal"), "debe", "Aporte patronal AFP"),
    ]);
  const isssPatronal = sumar(empleados, "isssPatronal");
  const afpPatronal = sumar(empleados, "afpPatronal");
  const lineas = [
    ...gastos,
    linea(codigos.get("210601")!, sumar(empleados, "isssLaboral"), "haber", "ISSS laboral por pagar"),
    linea(codigos.get("210603")!, sumar(empleados, "afpLaboral"), "haber", "AFP laboral por pagar"),
    linea(codigos.get("210604")!, sumar(empleados, "renta"), "haber", "Renta retenida por pagar"),
    linea(codigos.get("210606")!, sumar(empleados, "otrosDescuentos"), "haber", "Otros descuentos por pagar"),
    linea(codigos.get("210701")!, isssPatronal, "haber", "ISSS patronal por pagar"),
    linea(codigos.get("210703")!, afpPatronal, "haber", "AFP patronal por pagar"),
    linea(codigos.get("2112")!, sumar(empleados, "neto"), "haber", "Líquido por pagar a empleados"),
  ];
  return lineas.filter((item) => item.debe !== "0.00" || item.haber !== "0.00");
}

@Injectable()
export class CasosCalculoPlanilla {
  constructor(
    @Inject(REPOSITORIO_CALCULO_PLANILLA)
    private readonly repositorio: RepositorioCalculoPlanilla,
    private readonly partidas: PartidasBorrador,
  ) {}

  async calcular(
    usuarioId: string,
    empresaId: string,
    datos: CalcularPlanilla,
  ): Promise<ResultadoCalculoPlanillaVista> {
    const preparacion = await this.repositorio.preparar(usuarioId, empresaId, datos);
    if (preparacion.empleados.length === 0) throw new SinEmpleadosPlanillaError();

    const ajustesPorEmpleado = new Map(datos.ajustes.map((ajuste) => [ajuste.empleadoId, ajuste]));
    const idsVisibles = new Set(preparacion.empleados.map((empleado) => empleado.empleadoId));
    for (const ajuste of datos.ajustes) {
      if (!idsVisibles.has(ajuste.empleadoId)) {
        throw new DatosPlanillaInvalidosError(
          "Uno de los empleados indicados no pertenece a la sucursal seleccionada.",
        );
      }
    }

    let empleados: EmpleadoPlanillaVista[];
    try {
      empleados = preparacion.empleados.map((empleado) => {
        const ajuste = ajustesPorEmpleado.get(empleado.empleadoId);
        return calcularEmpleadoPlanilla(
          empleado,
          {
            horasExtra: ajuste?.horasExtra ?? "0.00",
            diasAusencia: ajuste?.diasAusencia ?? "0.00",
            otrosDescuentos: ajuste?.otrosDescuentos ?? "0.00",
          },
          preparacion.configuracion,
        );
      });
    } catch (error) {
      throw new DatosPlanillaInvalidosError(
        error instanceof Error ? error.message : "Los ajustes de planilla no son válidos.",
      );
    }

    const resumen = resumirPlanilla(empleados);
    const datosPartida: CrearPartida = {
      sucursalId: preparacion.sucursalId,
      fecha: finDeMes(preparacion.periodo),
      tipo: "operacion",
      concepto: `Planilla del período ${preparacion.periodo}`,
      lineas: crearLineas(preparacion, empleados),
    };
    if (datosPartida.lineas.length === 0) {
      throw new DatosPlanillaInvalidosError("No hay importes que registrar en la partida de planilla.");
    }
    if (preparacion.partidaExistente && preparacion.partidaExistente.estado !== "borrador") {
      throw new PartidaPlanillaNoEditableError(preparacion.partidaExistente.estado);
    }
    const partida = preparacion.partidaExistente
      ? await this.partidas.editar(usuarioId, empresaId, preparacion.partidaExistente.id, datosPartida)
      : await this.partidas.crear(usuarioId, empresaId, datosPartida, "planilla");
    await this.repositorio.guardarCalculo(
      usuarioId,
      empresaId,
      preparacion.periodo,
      preparacion.sucursalId,
      partida.id,
      empleados,
    );

    return {
      periodo: preparacion.periodo,
      sucursalId: preparacion.sucursalId,
      empleados,
      resumen,
      partida,
    };
  }
}
