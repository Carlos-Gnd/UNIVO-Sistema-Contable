import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type {
  ConfiguracionIsrVista,
  DetalleIsrAnual,
  EstadoCierreAnual,
  EjercicioSiguienteVista,
  PartidaAnualVista,
} from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaCierreAnual } from "./pantalla-cierre-anual";

const EMPRESA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GET = `GET /empresas/${EMPRESA}/cierre-anual`;
const CERRAR = `POST /empresas/${EMPRESA}/cierre-anual/ejercicios/2026/cerrar-noviembre`;
const CONFIGURAR = `POST /empresas/${EMPRESA}/cierre-anual/configuracion-isr`;
const CALCULAR = `POST /empresas/${EMPRESA}/cierre-anual/ejercicios/2026/impuesto-renta`;
const GENERAR_CIERRE = `POST /empresas/${EMPRESA}/cierre-anual/ejercicios/2026/partida-cierre`;
const CONFIRMAR_CIERRE = `POST /empresas/${EMPRESA}/cierre-anual/ejercicios/2026/confirmar-cierre`;
const GENERAR_REAPERTURA = `POST /empresas/${EMPRESA}/cierre-anual/ejercicios/2026/reapertura`;
const CONTADOR: CodigoPermiso[] = [
  "declaraciones.ver",
  "declaraciones.generar",
  "periodos.cerrar",
  "partidas.registrar",
];
const SOLO_LECTURA: CodigoPermiso[] = ["declaraciones.ver"];

const configNatural: ConfiguracionIsrVista = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  anio: 2026,
  version: 1,
  tipoContribuyente: "persona_natural",
  tasaSociedad: null,
  tramos: [
    { desde: "0.00", hasta: "6600.00", porcentaje: "0.00", cuotaFija: "0.00" },
    { desde: "6600.00", hasta: "10742.86", porcentaje: "10.00", cuotaFija: "212.12" },
    { desde: "10742.86", hasta: "24457.14", porcentaje: "20.00", cuotaFija: "720.00" },
    { desde: "24457.14", hasta: null, porcentaje: "30.00", cuotaFija: "3462.86" },
  ],
  creadoEn: "2026-11-23T12:00:00.000Z",
};

const detalle: DetalleIsrAnual = {
  utilidadAntesImpuesto: "7594.99",
  baseImponible: "7594.99",
  impuestoDeterminado: "311.62",
  pagosACuenta: "805.90",
  pagosAplicados: "311.62",
  impuestoPendiente: "0.00",
  saldoAFavor: "494.28",
  utilidadDespuesDeImpuesto: "7283.37",
  capitalSocial: "0.00",
  reservaLegalActual: "0.00",
  limiteReservaLegal: "0.00",
  reservaLegalDisponible: "0.00",
  reservaLegalAProvisionar: "0.00",
  tramoAplicado: { desde: "6600.00", hasta: "10742.86", porcentaje: "10.00", cuotaFija: "212.12" },
  tasaAplicada: "10.00",
};

const detalleSociedad: DetalleIsrAnual = {
  ...detalle,
  impuestoDeterminado: "1898.75",
  pagosAplicados: "805.90",
  impuestoPendiente: "1092.85",
  saldoAFavor: "0.00",
  utilidadDespuesDeImpuesto: "5696.24",
  capitalSocial: "10000.00",
  reservaLegalActual: "500.00",
  limiteReservaLegal: "2000.00",
  reservaLegalDisponible: "1500.00",
  reservaLegalAProvisionar: "398.74",
  tramoAplicado: null,
  tasaAplicada: "25.00",
};

function estado({
  listo = false,
  tipoContribuyente = "persona_natural",
  configuracionIsr = null,
  detalleIsr = null,
  partidaIsr = null,
  ejercicioCerrado = false,
  ejercicioSiguiente = null,
  vistaCierre = null,
  partidaCierre = null,
  vistaReapertura = null,
  partidaReapertura = null,
}: {
  listo?: boolean;
  tipoContribuyente?: "persona_natural" | "sociedad";
  configuracionIsr?: ConfiguracionIsrVista | null;
  detalleIsr?: DetalleIsrAnual | null;
  partidaIsr?: EstadoCierreAnual["partidaIsr"];
  ejercicioCerrado?: boolean;
  ejercicioSiguiente?: EjercicioSiguienteVista | null;
  vistaCierre?: EstadoCierreAnual["vistaCierre"];
  partidaCierre?: PartidaAnualVista | null;
  vistaReapertura?: EstadoCierreAnual["vistaReapertura"];
  partidaReapertura?: PartidaAnualVista | null;
} = {}): EstadoCierreAnual {
  return {
    ejercicioId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    anio: 2026,
    tipoContribuyente,
    periodos: Array.from({ length: 12 }, (_, indice) => ({
      id: `dddddddd-dddd-4ddd-8ddd-${String(indice + 1).padStart(12, "0")}`,
      mes: indice + 1,
      estado: indice < 10 || (listo && indice === 10) ? "cerrado" : "abierto",
    })),
    validaciones: {
      sinBorradores: { ok: true, cantidad: 0 },
      periodosListos: {
        ok: listo,
        cerrados: listo ? 11 : 10,
        total: 12,
        mesesAbiertos: listo ? [12] : [11, 12],
      },
      partidasCuadradas: { ok: true, cantidad: 0 },
      balanza: { ok: true, debe: "32064.79", haber: "32064.79", diferencia: "0.00" },
    },
    listoParaIsr: listo,
    permisoGenerar: true,
    permisoCerrar: true,
    permisoReabrir: true,
    todasSucursales: true,
    ejercicioCerrado,
    ejercicioSiguiente,
    configuracionIsr,
    detalleIsr,
    partidaIsr,
    vistaCierre,
    partidaCierre,
    vistaReapertura,
    partidaReapertura,
  };
}

const abrir = (permisos: CodigoPermiso[] = CONTADOR) =>
  renderizar(<PantallaCierreAnual parametros={{ empresaId: EMPRESA }} />, { permisos });

describe("asistente de cierre anual e ISR (S3-T08)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("muestra el asistente de cinco pasos y cierra noviembre dejando diciembre abierto", async () => {
    let actual = estado();
    const peticiones = simularApi({
      [GET]: () => ({ cuerpo: actual }),
      [CERRAR]: () => {
        actual = estado({ listo: true });
        return { estado: 201, cuerpo: actual };
      },
    });
    const { usuario } = abrir();

    expect(await screen.findByRole("heading", { name: "Cierre del ejercicio 2026" })).toBeInTheDocument();
    expect(await screen.findByRole("navigation", { name: "Pasos del cierre anual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1. Validaciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2. Impuesto sobre la renta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "3. Partida de cierre" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "4. Reapertura" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "5. Confirmar" })).toBeDisabled();
    expect(screen.getByText("No hay partidas en borrador")).toBeInTheDocument();
    expect(
      screen.getByText("Debe US$ 32,064.79, haber US$ 32,064.79, diferencia US$ 0.00."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Diciembre permanecerá abierto para contabilizar la provisión y registrar la partida de cierre anual.",
      ),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Cerrar noviembre" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toBeUndefined();
    expect(actual.periodos[10]?.estado).toBe("cerrado");
    expect(actual.periodos[11]?.estado).toBe("abierto");

    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByRole("heading", { name: "Impuesto sobre la renta del ejercicio" }),
    ).toBeInTheDocument();
  });

  it("permite versionar la tabla oficial inicial y muestra los pagos acreditados", async () => {
    const configActualizada = { ...configNatural, version: 2 };
    let actual = estado({ listo: true, configuracionIsr: configNatural, detalleIsr: detalle });
    const peticiones = simularApi({
      [GET]: () => ({ cuerpo: actual }),
      [CONFIGURAR]: () => {
        actual = estado({ listo: true, configuracionIsr: configActualizada, detalleIsr: detalle });
        return {
          estado: 201,
          cuerpo: configActualizada,
        };
      },
      [CALCULAR]: () => {
        actual = estado({
          listo: true,
          configuracionIsr: configNatural,
          detalleIsr: detalle,
          partidaIsr: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", estado: "borrador", fecha: "2026-12-31" },
        });
        return {
          estado: 201,
          cuerpo: {
            detalle,
            partida: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", estado: "borrador", fecha: "2026-12-31" },
          },
        };
      },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Continuar" }));
    await usuario.click(screen.getByRole("button", { name: "Cambiar configuración" }));
    await usuario.click(screen.getByRole("button", { name: "Guardar configuración" }));
    expect(await screen.findByText("Configuración anual, versión 2")).toBeInTheDocument();
    expect(
      peticiones.find(
        (peticion) => peticion.metodo === "POST" && peticion.ruta.endsWith("/configuracion-isr"),
      )?.cuerpo,
    ).toEqual({
      anio: 2026,
      tipoContribuyente: "persona_natural",
      tramos: configNatural.tramos,
    });

    await usuario.click(screen.getByRole("button", { name: "Calcular y generar provisión en borrador" }));
    expect(
      await screen.findByText(
        "La provisión quedó registrada en borrador para su revisión y contabilización.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("US$ 805.90")).toBeInTheDocument();
    expect(screen.getAllByText("US$ 311.62").length).toBeGreaterThan(0);
    expect(screen.getByText("US$ 494.28")).toBeInTheDocument();
    expect(screen.getByText("Provisión del 31/12/2026, estado borrador.")).toBeInTheDocument();
    expect(
      peticiones.find((peticion) => peticion.metodo === "POST" && peticion.ruta.endsWith("/impuesto-renta"))
        ?.cuerpo,
    ).toBeUndefined();
  });

  it("muestra la partida de cierre, confirma el ejercicio y prepara la reapertura", async () => {
    const lineas = [
      { codigo: "5101", nombre: "Ventas", debe: "100.00", haber: "0.00" },
      { codigo: "6101", nombre: "Pérdidas y Ganancias", debe: "0.00", haber: "100.00" },
    ];
    const previewCierre = { utilidadNeta: "100.00", lineas };
    const ejercicioSiguiente: EjercicioSiguienteVista = {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      anio: 2027,
      periodoInicialId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      fechaInicio: "2027-01-01",
      estado: "abierto",
    };
    const cierreBorrador: PartidaAnualVista = {
      id: "11111111-aaaa-4aaa-8aaa-111111111111",
      estado: "borrador",
      fecha: "2026-12-31",
      lineas,
    };
    const cierreContabilizado: PartidaAnualVista = { ...cierreBorrador, estado: "contabilizada" };
    const reaperturaBorrador: PartidaAnualVista = {
      id: "22222222-bbbb-4bbb-8bbb-222222222222",
      estado: "borrador",
      fecha: "2027-01-01",
      lineas,
    };
    const isrContabilizado: EstadoCierreAnual["partidaIsr"] = {
      id: "33333333-cccc-4ccc-8ccc-333333333333",
      estado: "contabilizada",
      fecha: "2026-12-31",
    };
    let actual = estado({
      listo: true,
      configuracionIsr: configNatural,
      detalleIsr: detalle,
      partidaIsr: isrContabilizado,
      vistaCierre: previewCierre,
    });
    const peticiones = simularApi({
      [GET]: () => ({ cuerpo: actual }),
      [GENERAR_CIERRE]: () => {
        actual = estado({
          listo: true,
          configuracionIsr: configNatural,
          detalleIsr: detalle,
          partidaIsr: isrContabilizado,
          vistaCierre: previewCierre,
          partidaCierre: cierreBorrador,
        });
        return { estado: 201, cuerpo: cierreBorrador };
      },
      [CONFIRMAR_CIERRE]: () => {
        actual = estado({
          listo: true,
          configuracionIsr: configNatural,
          detalleIsr: detalle,
          partidaIsr: isrContabilizado,
          ejercicioCerrado: true,
          ejercicioSiguiente,
          vistaCierre: previewCierre,
          partidaCierre: cierreContabilizado,
          vistaReapertura: { lineas },
        });
        return { estado: 201, cuerpo: actual };
      },
      [GENERAR_REAPERTURA]: () => {
        actual = estado({
          listo: true,
          configuracionIsr: configNatural,
          detalleIsr: detalle,
          partidaIsr: isrContabilizado,
          ejercicioCerrado: true,
          ejercicioSiguiente,
          vistaCierre: previewCierre,
          partidaCierre: cierreContabilizado,
          vistaReapertura: { lineas },
          partidaReapertura: reaperturaBorrador,
        });
        return { estado: 201, cuerpo: reaperturaBorrador };
      },
    });
    const { usuario } = abrir();

    await usuario.click(await screen.findByRole("button", { name: "3. Partida de cierre" }));
    expect(await screen.findByRole("table", { name: "Vista previa de la partida" })).toBeInTheDocument();
    expect(screen.getAllByText("US$ 100.00").length).toBeGreaterThan(0);
    await usuario.click(screen.getByRole("button", { name: "Generar partida de cierre en borrador" }));
    expect(await screen.findByText("Partida de cierre del 31/12/2026, estado borrador.")).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.ruta.endsWith("/partida-cierre"))?.cuerpo).toBeUndefined();

    actual = estado({
      listo: true,
      configuracionIsr: configNatural,
      detalleIsr: detalle,
      partidaIsr: isrContabilizado,
      vistaCierre: previewCierre,
      partidaCierre: cierreContabilizado,
    });
    await usuario.click(screen.getByRole("button", { name: "Actualizar estado de la partida" }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar cierre del ejercicio" }));
    expect(await screen.findByText("El ejercicio y sus doce períodos están cerrados.")).toBeInTheDocument();
    expect(
      peticiones.find((peticion) => peticion.ruta.endsWith("/confirmar-cierre"))?.cuerpo,
    ).toBeUndefined();

    await usuario.click(screen.getByRole("button", { name: "4. Reapertura" }));
    expect(await screen.findByText("Cierre del ejercicio 2027, 01/01/2027")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Generar partida de reapertura en borrador" }));
    expect(
      await screen.findByText("Partida de reapertura del 01/01/2027, estado borrador."),
    ).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.ruta.endsWith("/reapertura"))?.cuerpo).toBeUndefined();

    await usuario.click(screen.getByRole("button", { name: "5. Confirmar" }));
    expect(
      await screen.findByText(
        "El ejercicio anterior está cerrado y la partida de reapertura quedó registrada en borrador.",
      ),
    ).toBeInTheDocument();
  });

  it("muestra la configuración de sociedad vacía y el detalle de reserva legal al guardarla", async () => {
    let actual = estado({ listo: true, tipoContribuyente: "sociedad" });
    const peticiones = simularApi({
      [GET]: () => ({ cuerpo: actual }),
      [CONFIGURAR]: (peticion) => {
        const configuracionSociedad: ConfiguracionIsrVista = {
          ...configNatural,
          tipoContribuyente: "sociedad",
          tasaSociedad: "25.00",
          tramos: [],
        };
        actual = estado({
          listo: true,
          tipoContribuyente: "sociedad",
          configuracionIsr: configuracionSociedad,
          detalleIsr: detalleSociedad,
        });
        return { estado: 201, cuerpo: { ...configuracionSociedad, ...(peticion.cuerpo as object) } };
      },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("button", { name: "Continuar" }));
    const tasa = screen.getByRole("textbox", { name: "Tasa de ISR (%)" });
    expect(tasa).toHaveValue("");

    await usuario.click(screen.getByRole("button", { name: "Guardar configuración" }));
    expect(await screen.findByText("Este valor es obligatorio.")).toBeInTheDocument();
    await usuario.type(tasa, "25.00");
    await usuario.click(screen.getByRole("button", { name: "Guardar configuración" }));

    expect(await screen.findByText("US$ 398.74")).toBeInTheDocument();
    expect(screen.getByText("Reserva legal del ejercicio, 7 %")).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.metodo === "POST")?.cuerpo).toEqual({
      anio: 2026,
      tipoContribuyente: "sociedad",
      tasaSociedad: "25.00",
    });
  });

  it("permite reintentar el estado y oculta las acciones sin permisos de escritura", async () => {
    let lecturas = 0;
    simularApi({
      [GET]: () => {
        lecturas += 1;
        return lecturas === 1
          ? { estado: 500, cuerpo: { message: "Error temporal" } }
          : { cuerpo: estado({ listo: true }) };
      },
    });
    const { usuario } = abrir(SOLO_LECTURA);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el estado del ejercicio.");
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Validaciones del ejercicio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar noviembre" })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "2. Impuesto sobre la renta" }));
    expect(
      await screen.findByText("Tu rol no permite configurar ni generar la provisión anual del ISR."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar configuración" })).not.toBeInTheDocument();
  });
});
