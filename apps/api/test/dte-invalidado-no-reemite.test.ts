// Un documento invalidado no se puede volver a emitir (HU-57, S4-T18).
// Complementa facturacion-electronica.test.ts (que ya cubre el flujo feliz de invalidar un CCF): aquí se prueba que,
// una vez invalidado, un DTE (factura, CCF o nota) queda inmutable y su venta o nota no genera otro DTE, tanto por la
// API como por las reglas de la base. Usa una base propia (contable_api_dte_invalida) para correr en paralelo.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DteResumen, DteVista, KardexVista } from "@contable/shared";
import { Dinero } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, errorDe, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let clienteId: string;
let productoId: string;
let cajaId: string;

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  return {
    status: r.status,
    cuerpo: tipo.includes("json") ? ((await r.json()) as Record<string, unknown>) : {},
    tipo,
  };
}

const emitido = (r: Awaited<ReturnType<typeof pedir>>) => {
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo as unknown as DteVista;
};

const factura = () =>
  pedir("POST", "/dte/ventas", {
    tipoDocumento: "factura",
    sucursalId: emp.sucursalId,
    condicionPago: "contado",
    cuentaPagoId: cajaId,
    lineas: [{ productoId, cantidad: 1, precioUnitario: 113 }],
  });

const ccf = () =>
  pedir("POST", "/dte/ventas", {
    tipoDocumento: "ccf",
    sucursalId: emp.sucursalId,
    terceroId: clienteId,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad: 2, precioUnitario: 250 }],
  });

const invalidar = (id: string, motivo = "Error en la emisión") =>
  pedir("POST", `/dte/${id}/invalidar`, { motivo });

const contar = async (sql: string) =>
  Number(
    (await c.query<{ n: string }>(`select count(*)::text n from (${sql}) t`, [emp.empresaId])).rows[0]!.n,
  );
const totalDtes = () => contar("select 1 from documentos_electronicos where empresa_id = $1");
const totalPartidas = () => contar("select 1 from partidas where empresa_id = $1");
const totalMovimientos = () => contar("select 1 from movimientos_inventario where empresa_id = $1");
const fila = async (id: string) =>
  (await c.query("select * from documentos_electronicos where id = $1", [id])).rows[0] as Record<
    string,
    unknown
  >;

const entradas = async () =>
  Dinero.de(
    (
      (await pedir("GET", `/productos/${productoId}/kardex?sucursalId=${emp.sucursalId}`))
        .cuerpo as unknown as KardexVista
    ).totales.entradaCantidad,
  );

beforeAll(async () => {
  process.env["FIRMA_SECRETO"] = "secreto-de-pruebas-de-firma-con-mas-de-32-caracteres";
  const urlBase = await basePropia("contable_api_dte_invalida");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-6");
  // El DTE se emite con la fecha de hoy: la empresa necesita el ejercicio del año en curso
  const anio = new Date().getFullYear();
  if (anio !== 2026) {
    await c.query(
      `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, $2, $3, $4)`,
      [emp.empresaId, anio, `${anio}-01-01`, `${anio}-12-31`],
    );
  }
  await crearUsuario(c, CONTADOR, 2, emp);
  cajaId = await emp.cuenta("110101");
  await c.query(
    `update empresas set nrc = '123456-7', direccion = 'Barrio El Centro, San Miguel', telefono = '2660-0000',
       correo = 'ventas@cherophonex.test', actividad_economica = '47411 · Venta de teléfonos'
     where id = $1`,
    [emp.empresaId],
  );

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();

  const tercero = async (cuerpo: Record<string, unknown>) =>
    (await pedir("POST", "/terceros", cuerpo)).cuerpo["id"] as string;
  clienteId = await tercero({
    nombre: "Tecno Plaza, S.A. de C.V.",
    nit: "1234-567890-123-0",
    nrc: "245871-4",
    actividadEconomica: "47411 · Venta de equipo de telefonía",
    direccion: "Av. Roosevelt, San Miguel",
    correo: "compras@tecnoplaza.test",
    esCliente: true,
  });
  const proveedorId = await tercero({
    nombre: "Totalynk",
    nit: "0000-000000-104-0",
    nrc: "123456-7",
    esProveedor: true,
  });
  productoId = (await pedir("POST", "/productos", { codigo: "CP-01", nombre: "Galaxy A15" })).cuerpo[
    "id"
  ] as string;
  const compra = await pedir("POST", "/compras", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: "CCF-P000",
    fecha: "2026-10-01",
    terceroId: proveedorId,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad: 100, precioUnitario: 100 }],
  });
  expect(compra.status, JSON.stringify(compra.cuerpo)).toBe(201);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("una factura invalidada no se vuelve a emitir (HU-57, S4-T18)", () => {
  let dte: DteVista;
  let antes: Record<string, unknown>;

  it("invalida la factura y la deja en estado invalidado con su evento firmado", async () => {
    dte = emitido(await factura());
    const r = await pedir("POST", `/dte/${dte.id}/invalidar`, {
      motivo: "Datos del receptor incorrectos",
      tipoInvalidacion: 2,
    });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo).toMatchObject({ estado: "invalidado", invalidacion: { tipo: 2 } });
    antes = await fila(dte.id);
    expect(antes["estado"]).toBe("invalidado");
    expect(antes["sello_invalidacion"]).not.toBeNull();
  });

  it("invalidarla otra vez da 422 y no crea DTE, partidas ni movimientos de kardex", async () => {
    const dtes = await totalDtes();
    const partidas = await totalPartidas();
    const movimientos = await totalMovimientos();
    const entrada = await entradas();
    const r = await invalidar(dte.id, "Segundo intento");
    expect(r.status).toBe(422);
    expect(String(r.cuerpo["message"])).toMatch(/ya está invalidado/);
    expect(await totalDtes()).toBe(dtes);
    expect(await totalPartidas()).toBe(partidas);
    expect(await totalMovimientos()).toBe(movimientos);
    // La mercadería regresó una sola vez
    expect((await entradas()).aTexto()).toBe(entrada.aTexto());
  });

  it("el reintento no altera el evento, la firma, el sello ni el motivo originales", async () => {
    const despues = await fila(dte.id);
    for (const campo of [
      "estado",
      "motivo_invalidacion",
      "evento_invalidacion",
      "firma_invalidacion",
      "sello_invalidacion",
      "invalidado_en",
      "invalidado_por",
    ]) {
      expect(despues[campo], campo).toEqual(antes[campo]);
    }
    expect(despues["motivo_invalidacion"]).toBe("Datos del receptor incorrectos");
  });

  it("sigue consultable (no se borra) y figura solo como invalidado en la lista", async () => {
    const ver = await pedir("GET", `/dte/${dte.id}`);
    expect(ver.status).toBe(200);
    expect(ver.cuerpo).toMatchObject({ id: dte.id, estado: "invalidado" });
    const procesados = (await pedir("GET", "/dte?estado=procesado")).cuerpo as unknown as DteResumen[];
    expect(procesados.map((d) => d.id)).not.toContain(dte.id);
    const invalidados = (await pedir("GET", "/dte?estado=invalidado")).cuerpo as unknown as DteResumen[];
    expect(invalidados.map((d) => d.id)).toContain(dte.id);
  });

  it("la base impide reactivarlo, modificarlo, borrarlo o emitir otro DTE de la misma venta", async () => {
    expect(
      await errorDe(c, `update documentos_electronicos set estado = 'procesado' where id = $1`, [dte.id]),
    ).toMatch(/ya está invalidado/);
    expect(
      await errorDe(c, `update documentos_electronicos set total = total + 1 where id = $1`, [dte.id]),
    ).toMatch(/ya está invalidado/);
    expect(await errorDe(c, `delete from documentos_electronicos where id = $1`, [dte.id])).toMatch(
      /no se borra/,
    );
    const original = await fila(dte.id);
    expect(
      await errorDe(
        c,
        `insert into documentos_electronicos (empresa_id, sucursal_id, tipo_dte, documento_id, codigo_generacion,
           numero_control, fecha_emision, hora_emision, total, iva, documento, firma, certificado_id, sello_recepcion)
         values ($1, $2, '01', $3, gen_random_uuid(), 'DTE-01-M0010001-999999999999998', current_date, '10:00',
           1, 0, '{}', 'x', $4, $5)`,
        [
          emp.empresaId,
          emp.sucursalId,
          original["documento_id"],
          original["certificado_id"],
          original["sello_recepcion"],
        ],
      ),
    ).toMatch(/documentos_electronicos_documento_id_key|duplicate key/);
    expect((await fila(dte.id))["estado"]).toBe("invalidado");
  });

  it("una venta nueva obtiene otro número de control: el del invalidado no se reutiliza", async () => {
    const nuevo = emitido(await factura());
    expect(nuevo.id).not.toBe(dte.id);
    expect(nuevo.numeroControl).not.toBe(dte.numeroControl);
    expect(nuevo.codigoGeneracion).not.toBe(dte.codigoGeneracion);
    expect(nuevo.documentoId).not.toBe(dte.documentoId);
    expect(nuevo.estado).toBe("procesado");
  });
});

describe("una nota electrónica invalidada no se vuelve a emitir (HU-57, S4-T18)", () => {
  it("la nota de crédito invalidada queda inmutable y el CCF ya no la cuenta como vigente", async () => {
    const ccfDte = emitido(await ccf());
    const nota = emitido(
      await pedir("POST", "/dte/notas", {
        documentoId: ccfDte.documentoId,
        tipo: "credito",
        motivo: "rebaja",
        lineas: [{ lineaOrden: 1, monto: 50 }],
      }),
    );
    expect((await invalidar(nota.id, "Rebaja duplicada")).status).toBe(201);

    const dtes = await totalDtes();
    const partidas = await totalPartidas();
    const antes = await fila(nota.id);
    const otra = await invalidar(nota.id, "Segundo intento");
    expect(otra.status).toBe(422);
    expect(String(otra.cuerpo["message"])).toMatch(/ya está invalidado/);
    expect(await totalDtes()).toBe(dtes);
    expect(await totalPartidas()).toBe(partidas);
    expect(await fila(nota.id)).toEqual(antes);

    // La nota no se reemite: la base impide un segundo DTE para la misma nota y su reactivación
    expect(
      await errorDe(c, `update documentos_electronicos set estado = 'procesado' where id = $1`, [nota.id]),
    ).toMatch(/ya está invalidado/);
    expect(
      await errorDe(
        c,
        `insert into documentos_electronicos (empresa_id, sucursal_id, tipo_dte, nota_id, relacionado_id, codigo_generacion,
           numero_control, fecha_emision, hora_emision, total, iva, documento, firma, certificado_id, sello_recepcion)
         values ($1, $2, '05', $3, $4, gen_random_uuid(), 'DTE-05-M0010001-999999999999998', current_date, '10:00',
           1, 0, '{}', 'x', $5, $6)`,
        [
          emp.empresaId,
          emp.sucursalId,
          antes["nota_id"],
          ccfDte.id,
          antes["certificado_id"],
          antes["sello_recepcion"],
        ],
      ),
    ).toMatch(/documentos_electronicos_nota_id_key|duplicate key/);

    // Sin notas vigentes, el CCF sí se puede invalidar; ya invalidado, no admite notas nuevas ni otra invalidación
    expect((await invalidar(ccfDte.id, "El cliente desistió")).status).toBe(201);
    const nuevaNota = await pedir("POST", "/dte/notas", {
      documentoId: ccfDte.documentoId,
      tipo: "credito",
      motivo: "rebaja",
      lineas: [{ lineaOrden: 1, monto: 10 }],
    });
    expect(nuevaNota.status).toBe(422);
    expect(String(nuevaNota.cuerpo["message"])).toMatch(/invalidado/);
    expect((await invalidar(ccfDte.id, "Otra vez")).status).toBe(422);
  });
});
