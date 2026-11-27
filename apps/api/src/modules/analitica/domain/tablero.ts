import { Dinero } from "@contable/shared";

export interface ConsultaTablero {
  mes: string;
  sucursalId?: string;
}

export interface DatosTablero {
  ventasNetas: string;
  costoVentas: string;
  gastosOperacion: string;
  utilidadEjercicio: string;
  efectivo: string;
  ventasSemanales: readonly {
    semana: number;
    comprobantesCreditoFiscal: string;
    consumidorFinal: string;
  }[];
  productos: readonly {
    id: string;
    nombre: string;
    utilidadBruta: string;
  }[];
  categorias: readonly {
    id: string;
    nombre: string;
    ventasNetas: string;
    utilidadBruta: string;
  }[];
}

export interface TableroIndicadores {
  ventasNetas: string;
  utilidadBruta: string;
  utilidadEjercicio: string;
  efectivo: string;
  margenBruto: string;
  margenNeto: string;
  ventasSemanales: readonly {
    etiqueta: string;
    comprobantesCreditoFiscal: string;
    consumidorFinal: string;
  }[];
  etapasUtilidad: readonly {
    id: string;
    concepto: string;
    monto: string;
    porcentajeVentas: string;
  }[];
  productosRentables: readonly {
    id: string;
    nombre: string;
    utilidadBruta: string;
  }[];
  categorias: readonly {
    id: string;
    nombre: string;
    ventasNetas: string;
    utilidadBruta: string;
  }[];
}

const porcentajeDeVentas = (monto: Dinero, ventas: Dinero): string =>
  ventas.esCero() ? "0.00" : monto.por(100).dividido(ventas.aTexto()).aTexto();

/** Da forma a los indicadores sin usar aritmética binaria para los importes contables. */
export function armarTablero(datos: DatosTablero): TableroIndicadores {
  const ventas = Dinero.de(datos.ventasNetas);
  const costo = Dinero.de(datos.costoVentas);
  const gastos = Dinero.de(datos.gastosOperacion);
  const utilidadBruta = ventas.menos(costo);

  return {
    ventasNetas: ventas.aTexto(),
    utilidadBruta: utilidadBruta.aTexto(),
    utilidadEjercicio: Dinero.de(datos.utilidadEjercicio).aTexto(),
    efectivo: Dinero.de(datos.efectivo).aTexto(),
    margenBruto: porcentajeDeVentas(utilidadBruta, ventas),
    margenNeto: porcentajeDeVentas(Dinero.de(datos.utilidadEjercicio), ventas),
    ventasSemanales: [1, 2, 3, 4, 5].map((semana) => {
      const fila = datos.ventasSemanales.find((v) => v.semana === semana);
      return {
        etiqueta: String(semana),
        comprobantesCreditoFiscal: Dinero.de(fila?.comprobantesCreditoFiscal ?? "0.00").aTexto(),
        consumidorFinal: Dinero.de(fila?.consumidorFinal ?? "0.00").aTexto(),
      };
    }),
    etapasUtilidad: [
      { id: "ventas", concepto: "Ventas netas", monto: ventas.aTexto(), porcentajeVentas: "100.00" },
      {
        id: "costo-ventas",
        concepto: "Costo de ventas",
        monto: costo.esCero() ? "0.00" : costo.por(-1).aTexto(),
        porcentajeVentas: porcentajeDeVentas(costo, ventas),
      },
      {
        id: "utilidad-bruta",
        concepto: "Utilidad bruta",
        monto: utilidadBruta.aTexto(),
        porcentajeVentas: porcentajeDeVentas(utilidadBruta, ventas),
      },
      {
        id: "gastos-operacion",
        concepto: "Gastos de operación",
        monto: gastos.esCero() ? "0.00" : gastos.por(-1).aTexto(),
        porcentajeVentas: porcentajeDeVentas(gastos, ventas),
      },
      {
        id: "utilidad-ejercicio",
        concepto: "Utilidad del ejercicio",
        monto: Dinero.de(datos.utilidadEjercicio).aTexto(),
        porcentajeVentas: porcentajeDeVentas(Dinero.de(datos.utilidadEjercicio), ventas),
      },
    ],
    productosRentables: datos.productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      utilidadBruta: Dinero.de(p.utilidadBruta).aTexto(),
    })),
    categorias: datos.categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      ventasNetas: Dinero.de(c.ventasNetas).aTexto(),
      utilidadBruta: Dinero.de(c.utilidadBruta).aTexto(),
    })),
  };
}

export class TableroEmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

export class SinPermisoTableroError extends Error {
  constructor() {
    super("Su rol no permite consultar el tablero.");
  }
}

export class SucursalTableroNoAutorizadaError extends Error {
  constructor() {
    super("No tiene acceso a la sucursal indicada.");
  }
}

export class PeriodoTableroNoEncontradoError extends Error {
  constructor(mes: string) {
    super(`No hay un ejercicio que contenga ${mes}.`);
  }
}
