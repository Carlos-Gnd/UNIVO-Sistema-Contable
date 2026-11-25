import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { AbonoResumen, CuentaTesoreriaVista, DocumentoPendiente } from "@contable/shared";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { PantallaCobrosPagos } from "./pantalla-cobros-pagos";
import { repartirAbono } from "./reparto";

const E = "e1";
const ADMIN: CodigoPermiso[] = ["operaciones.ver", "operaciones.registrar", "tesoreria.ver"];
const SUCURSAL = "33333333-3333-4333-8333-333333333333";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const D1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const D2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const D3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BANCO = "44444444-4444-4444-8444-444444444444";

const pendiente = (extra: Partial<DocumentoPendiente> = {}): DocumentoPendiente => ({
  id: D1,
  operacion: "venta",
  tipoDocumento: "ccf",
  numeroDocumento: "CCF-0001",
  fecha: "2026-10-04",
  fechaVencimiento: "2026-10-19",
  sucursalId: SUCURSAL,
  tercero: { id: T1, nombre: "Tecno Plaza" },
  condicionPago: "credito",
  totalNeto: "1130.00",
  ajustes: "0.00",
  abonado: "130.00",
  saldo: "1000.00",
  estadoPartida: "contabilizada",
  ...extra,
});

const banco = {
  id: "ct1",
  tipo: "banco",
  nombre: "Banco Agrícola",
  banco: "Agrícola",
  numeroCuenta: "1",
  cuentaId: BANCO,
  cuentaCodigo: "11010301",
  cuentaNombre: "Banco",
  sucursalId: null,
  sucursal: null,
  activa: true,
  saldo: "0.00",
} satisfies CuentaTesoreriaVista;

const abonoLista = (): AbonoResumen => ({
  id: "ab1",
  operacion: "venta",
  sucursalId: SUCURSAL,
  tercero: { id: T1, nombre: "Tecno Plaza", nit: "1234-567890-123-0" },
  fecha: "2026-10-10",
  referencia: "REC-1",
  cuentaPagoId: BANCO,
  monto: "130.00",
  partidaId: "p1",
  estadoPartida: "borrador",
  observaciones: null,
});

const base = {
  [`GET /empresas/${E}/abonos/pendientes`]: ({ consulta }: { consulta: URLSearchParams }) =>
    consulta.get("operacion") === "venta"
      ? {
          cuerpo: [
            pendiente(),
            pendiente({
              id: D2,
              numeroDocumento: "CCF-0002",
              fechaVencimiento: "2026-10-29",
              saldo: "500.00",
            }),
            pendiente({
              id: D3,
              numeroDocumento: "CCF-0003",
              tercero: { id: T2, nombre: "Otra Casa" },
              saldo: "200.00",
            }),
          ],
        }
      : {
          cuerpo: [
            pendiente({
              id: D1,
              operacion: "compra",
              numeroDocumento: "P-1",
              tercero: { id: T1, nombre: "Totalynk" },
              saldo: "45200.00",
              totalNeto: "45200.00",
              abonado: "0.00",
            }),
          ],
        },
  [`GET /empresas/${E}/abonos`]: { cuerpo: [abonoLista()] },
  [`GET /empresas/${E}/cuentas-tesoreria`]: { cuerpo: [banco] },
};

const abrir = (permisos: CodigoPermiso[] = ADMIN) =>
  renderizar(<PantallaCobrosPagos parametros={{ empresaId: E }} />, { permisos });

describe("repartirAbono (HU-62)", () => {
  const docs = [
    { id: "a", saldo: "1000.00" },
    { id: "b", saldo: "500.00" },
  ];
  it("cubre primero el documento más antiguo y deja parcial el último", () => {
    expect(repartirAbono(docs, "1200.00")).toEqual([
      { documentoId: "a", monto: "1000.00" },
      { documentoId: "b", monto: "200.00" },
    ]);
  });
  it("un abono menor al primer saldo no toca los demás", () => {
    expect(repartirAbono(docs, "18000.00".replace("18000", "300"))).toEqual([
      { documentoId: "a", monto: "300.00" },
    ]);
    expect(repartirAbono(docs, "0")).toEqual([]);
  });
});

describe("cobros y pagos (HU-62, S3-T71)", () => {
  it("lista lo que cada cliente debe con su saldo, el vencimiento y los cobros registrados", async () => {
    simularApi(base);
    abrir();
    const fila = (await screen.findByText(/CCF CCF-0001/)).closest("tr")!;
    expect(within(fila).getByText("US$ 1,000.00")).toBeInTheDocument();
    expect(within(fila).getByText("Vencido")).toBeInTheDocument();
    expect(await screen.findByText("REC-1")).toBeInTheDocument();
  });

  it("registra un cobro parcial repartido entre dos documentos del mismo cliente", async () => {
    const peticiones = simularApi({
      ...base,
      [`POST /empresas/${E}/abonos`]: { estado: 201, cuerpo: { ...abonoLista(), aplicaciones: [] } },
    });
    const { usuario } = abrir();
    await usuario.click(await screen.findByLabelText("Elegir CCF CCF-0001"));
    await usuario.click(screen.getByLabelText("Elegir CCF CCF-0002"));
    // los documentos de otro cliente quedan bloqueados
    expect(screen.getByLabelText("Elegir CCF CCF-0003")).toBeDisabled();
    expect(screen.getByText(/2 documento\(s\) elegidos · saldo US\$ 1,500\.00/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Registrar cobro" }));
    const dialogo = await screen.findByRole("dialog");

    const monto = within(dialogo).getByLabelText("Monto (US$)");
    await usuario.clear(monto);
    await usuario.type(monto, "1200");
    const reparto = within(dialogo).getByRole("list", { name: "Cómo se aplica" });
    expect(within(reparto).getByText("CCF CCF-0001").closest("li")).toHaveTextContent("US$ 1,000.00");
    expect(within(reparto).getByText("CCF CCF-0002").closest("li")).toHaveTextContent("US$ 200.00");

    await waitFor(() =>
      expect(within(dialogo).getByRole("option", { name: "Banco Agrícola" })).toBeInTheDocument(),
    );
    await usuario.selectOptions(within(dialogo).getByLabelText("Se deposita en"), BANCO);
    await usuario.click(within(dialogo).getByRole("button", { name: "Registrar cobro" }));
    await waitFor(() =>
      expect(peticiones.find((p) => p.metodo === "POST")?.cuerpo).toMatchObject({
        operacion: "venta",
        terceroId: T1,
        sucursalId: SUCURSAL,
        cuentaPagoId: BANCO,
        aplicaciones: [
          { documentoId: D1, monto: "1000.00" },
          { documentoId: D2, monto: "200.00" },
        ],
      }),
    );
  });

  it("el monto no puede pasar el saldo de lo elegido", async () => {
    const peticiones = simularApi(base);
    const { usuario } = abrir();
    await usuario.click(await screen.findByLabelText("Elegir CCF CCF-0001"));
    await usuario.click(screen.getByRole("button", { name: "Registrar cobro" }));
    const dialogo = await screen.findByRole("dialog");
    const monto = within(dialogo).getByLabelText("Monto (US$)");
    await usuario.clear(monto);
    await usuario.type(monto, "1000.01");
    expect(within(dialogo).getByText("El monto supera el saldo de lo elegido.")).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === "POST")).toBe(false);
  });

  it("la pestaña de proveedores muestra lo que se debe y registra pagos", async () => {
    simularApi(base);
    const { usuario } = abrir();
    await usuario.click(await screen.findByRole("tab", { name: "Por pagar" }));
    const fila = (await screen.findByText(/CCF P-1/)).closest("tr")!;
    expect(within(fila).getByText("Totalynk")).toBeInTheDocument();
    expect(within(fila).getAllByText("US$ 45,200.00").length).toBeGreaterThan(0);
    await usuario.click(within(fila).getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Registrar pago" })).toBeEnabled();
  });

  it("sin permiso de registrar solo se consulta", async () => {
    simularApi(base);
    abrir(["operaciones.ver"]);
    await screen.findByText(/CCF CCF-0001/);
    expect(screen.queryByRole("button", { name: "Registrar cobro" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Elegir CCF CCF-0001")).not.toBeInTheDocument();
  });
});
