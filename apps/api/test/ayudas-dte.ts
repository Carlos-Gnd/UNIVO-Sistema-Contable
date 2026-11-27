// Ayudas para las pruebas de aceptación de la facturación electrónica (HU-53 a HU-56): una empresa emisora completa
// con los clientes de CheroPhonex, existencias de sobra y el sistema levantado sobre su propia base.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { esNitValido, type DteVista } from "@contable/shared";
import { expect } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { VENTAS_CCF_CHEROPHONEX } from "./datos-iva-cherophonex";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

export const CONTADOR = "11111111-1111-4111-8111-111111111111";
export const CONSULTA = "33333333-3333-4333-8333-333333333333";

export interface RespuestaDte {
  status: number;
  cuerpo: Record<string, unknown>;
}

export interface SistemaDte {
  c: Awaited<ReturnType<typeof reiniciarBase>>;
  app: INestApplication;
  url: string;
  emp: EmpresaComercial;
  productoId: string;
  cajaId: string;
  /** Clientes de los CCF de CheroPhonex por NRC */
  clientes: Map<string, { id: string; nombre: string; nit: string }>;
  pedir: (metodo: string, ruta: string, usuario: string | null, cuerpo?: unknown) => Promise<RespuestaDte>;
  emitir: (cuerpo: Record<string, unknown>, usuario?: string) => Promise<DteVista>;
  cerrar: () => Promise<void>;
}

/** NIT de 14 dígitos con el dígito verificador correcto, a partir de sus primeros 13 dígitos. */
export function nitConVerificador(trece: string): string {
  for (let verificador = 0; verificador <= 9; verificador++) {
    const candidato = `${trece.slice(0, 4)}-${trece.slice(4, 10)}-${trece.slice(10, 13)}-${verificador}`;
    if (esNitValido(candidato)) return candidato;
  }
  throw new Error(`No hay verificador válido para ${trece}`);
}

/**
 * Levanta una base propia con la empresa emisora (con NRC, dirección, teléfono y correo, como exige el DTE),
 * los clientes de los CCF de CheroPhonex y 1,000 unidades de un producto para vender.
 */
export async function iniciarSistemaDte(nombreBase: string, nit: string): Promise<SistemaDte> {
  process.env["FIRMA_SECRETO"] = "secreto-de-pruebas-de-firma-con-mas-de-32-caracteres";
  const urlBase = await basePropia(nombreBase);
  const c = await reiniciarBase(urlBase);
  const emp = await crearEmpresaComercial(c, nit);
  // El DTE se emite con la fecha de hoy: la empresa necesita el ejercicio del año en curso
  const anio = new Date().getFullYear();
  if (anio !== 2026) {
    await c.query(
      `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, $2, $3, $4)`,
      [emp.empresaId, anio, `${anio}-01-01`, `${anio}-12-31`],
    );
  }
  await c.query(
    `update empresas set nombre = 'CHERO PHONEX', nrc = '123456-7', direccion = 'Barrio El Centro, San Miguel',
       telefono = '2660-0000', correo = 'ventas@cherophonex.test', actividad_economica = '47411 · Venta de teléfonos'
     where id = $1`,
    [emp.empresaId],
  );
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, CONSULTA, 4, emp, [emp.sucursalId]);
  const cajaId = await emp.cuenta("110101");

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  const app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();

  const pedir: SistemaDte["pedir"] = async (metodo, ruta, usuario, cuerpo) => {
    const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
      method: metodo,
      headers: {
        "content-type": "application/json",
        ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const esJson = (r.headers.get("content-type") ?? "").includes("json");
    return { status: r.status, cuerpo: esJson ? ((await r.json()) as Record<string, unknown>) : {} };
  };

  const crear = async (ruta: string, cuerpo: Record<string, unknown>) => {
    const r = await pedir("POST", ruta, CONTADOR, cuerpo);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo["id"] as string;
  };

  // Los clientes de los CCF de CheroPhonex: NRC y razón social del libro de ventas, con un NIT válido cada uno
  const clientes: SistemaDte["clientes"] = new Map();
  let correlativo = 1;
  for (const [, , nrc, nombre] of VENTAS_CCF_CHEROPHONEX) {
    if (clientes.has(nrc)) continue;
    const nitCliente = nitConVerificador(`0614${String(900000 + correlativo++)}001`);
    const id = await crear("/terceros", {
      nombre,
      nit: nitCliente,
      nrc,
      actividadEconomica: "47411 · Venta de equipo de telefonía",
      direccion: "Calle principal, San Miguel",
      correo: `compras${correlativo}@cliente.test`,
      esCliente: true,
    });
    clientes.set(nrc, { id, nombre, nit: nitCliente });
  }

  const proveedorId = await crear("/terceros", {
    nombre: "Totalynk El Salvador",
    nit: nitConVerificador("0614800001001"),
    nrc: "301245-7",
    esProveedor: true,
  });
  const productoId = await crear("/productos", { codigo: "CP-01", nombre: "Samsung Galaxy S24 256 GB" });
  const compra = await pedir("POST", "/compras", CONTADOR, {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: "CCF-P001",
    fecha: "2026-10-01",
    terceroId: proveedorId,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad: 1000, precioUnitario: 590 }],
  });
  expect(compra.status, JSON.stringify(compra.cuerpo)).toBe(201);

  const emitir: SistemaDte["emitir"] = async (cuerpo, usuario = CONTADOR) => {
    const r = await pedir("POST", "/dte/ventas", usuario, cuerpo);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo as unknown as DteVista;
  };

  return {
    c,
    app,
    url,
    emp,
    productoId,
    cajaId,
    clientes,
    pedir,
    emitir,
    cerrar: async () => {
      await app.close();
      await c.end();
    },
  };
}
