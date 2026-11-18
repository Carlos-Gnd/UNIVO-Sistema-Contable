import { describe, expect, it } from "vitest";
import {
  CuentaLibroMayorNoEncontradaError,
  EmpresaNoEncontradaLibroMayorError,
  SinPermisoLibroMayorError,
  SucursalNoAutorizadaLibroMayorError,
  type AccesoLibroMayor,
  type ConsultaMovimientosLibroMayor,
  type DatosCuentaLibroMayor,
  type RepositorioLibroMayor,
  type UnidadLibroMayor,
} from "../domain/libro-mayor.js";
import { ConsultarLibroMayor } from "./consultar-libro-mayor.js";

const acceso: AccesoLibroMayor = {
  permisos: new Set(["reportes.ver"]),
  todasSucursales: true,
  sucursales: [],
};
const datos: DatosCuentaLibroMayor = {
  cuentaId: "c1",
  codigo: "1101",
  nombre: "Caja",
  naturaleza: "deudora",
  movimientos: [],
};

function caso(
  options: {
    acceso?: AccesoLibroMayor | null;
    sucursalExiste?: boolean;
    cuenta?: DatosCuentaLibroMayor | null;
  } = {},
) {
  let consulta: ConsultaMovimientosLibroMayor | undefined;
  const unidad: UnidadLibroMayor = {
    acceso: async () => (options.acceso === undefined ? acceso : options.acceso),
    existeSucursal: async () => options.sucursalExiste ?? true,
    cuenta: async (c) => {
      consulta = c;
      return options.cuenta === undefined ? datos : options.cuenta;
    },
  };
  const repositorio: RepositorioLibroMayor = { enTransaccion: (_usuario, fn) => fn(unidad) };
  return { servicio: new ConsultarLibroMayor(repositorio), consulta: () => consulta };
}

describe("ConsultarLibroMayor", () => {
  it("autoriza reportes y limita el consolidado a las sucursales visibles", async () => {
    const c = caso({
      acceso: { permisos: new Set(["reportes.ver"]), todasSucursales: false, sucursales: ["s1"] },
    });
    const mayor = await c.servicio.ejecutar("u1", "e1", "c1", { desde: "2026-01-01" });
    expect(mayor.codigo).toBe("1101");
    expect(c.consulta()?.sucursales).toEqual(["s1"]);
  });

  it("valida acceso, permiso, sucursal y cuenta", async () => {
    await expect(caso({ acceso: null }).servicio.ejecutar("u", "e", "c", {})).rejects.toThrow(
      EmpresaNoEncontradaLibroMayorError,
    );
    await expect(
      caso({ acceso: { ...acceso, permisos: new Set() } }).servicio.ejecutar("u", "e", "c", {}),
    ).rejects.toThrow(SinPermisoLibroMayorError);
    await expect(
      caso({ acceso: { ...acceso, todasSucursales: false, sucursales: ["s1"] } }).servicio.ejecutar(
        "u",
        "e",
        "c",
        { sucursalId: "s2" },
      ),
    ).rejects.toThrow(SucursalNoAutorizadaLibroMayorError);
    await expect(caso({ cuenta: null }).servicio.ejecutar("u", "e", "c", {})).rejects.toThrow(
      CuentaLibroMayorNoEncontradaError,
    );
  });
});
