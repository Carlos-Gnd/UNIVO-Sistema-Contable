import {
  Dinero,
  type CampoNota,
  type ClaveNota,
  type MetodoValuacion,
  type NotaEstado,
  type TablaNota,
  type FormatoEstados,
} from "@contable/shared";
import type { FilaSaldos } from "./balanza.js";
import { mayorDe, type NombresDeMayor } from "./estados.js";

/** Lo que las notas toman de la empresa: identificación, parámetros contables y número de sucursales. */
export interface DatosEmpresaNotas {
  nombre: string;
  nit: string;
  nrc: string | null;
  actividadEconomica: string | null;
  tipoContribuyente: "persona_natural" | "sociedad";
  formatoEstados: FormatoEstados;
  metodoValuacion: MetodoValuacion;
  sistemaInventario: "perpetuo" | "analitico";
  sucursalesActivas: number;
}

/** Texto vigente de una nota guardada. */
export interface NotaGuardada {
  version: number;
  texto: string;
}

const NOMBRE_FORMATO: Record<FormatoEstados, string> = {
  clase: "con el formato de clase",
  niif_pymes: "con el formato de la NIIF para las PYMES",
};
const NOMBRE_VALUACION: Record<MetodoValuacion, string> = {
  promedio_ponderado: "costo promedio ponderado",
  peps: "primeras entradas, primeras salidas (PEPS)",
};
const NOMBRE_SISTEMA = { perpetuo: "perpetuo", analitico: "analítico" } as const;
const NOMBRE_CONTRIBUYENTE = { persona_natural: "persona natural", sociedad: "sociedad" } as const;

/** Saldo final neto (debe menos haber) de una cuenta: el inicial más los movimientos del período. */
const saldoFinal = (f: FilaSaldos) =>
  Dinero.de(f.saldoInicial).mas(f.movimientoDebe).menos(f.movimientoHaber);

const sumar = (valores: Iterable<Dinero>) => {
  let total = Dinero.cero();
  for (const v of valores) total = total.mas(v);
  return total;
};

const dinero = (nombre: string, valor: Dinero): CampoNota => ({
  nombre,
  valor: valor.aTexto(),
  tipo: "dinero",
});
const texto = (nombre: string, valor: string): CampoNota => ({ nombre, valor, tipo: "texto" });

const deMayores = (filas: readonly FilaSaldos[], mayores: readonly string[]) =>
  filas.filter((f) => mayores.includes(mayorDe(f.codigo)));

/** Saldo con el signo propio de la cuenta: deudor para el activo, acreedor para el pasivo y el patrimonio. */
const acreedor = (f: FilaSaldos) => Dinero.cero().menos(saldoFinal(f));

/** Tabla de saldos finales por cuenta con una fila de total; las cuentas en cero se omiten. */
function tablaDeSaldos(
  filas: readonly FilaSaldos[],
  valor: (f: FilaSaldos) => Dinero,
  titulo = "Saldo",
): TablaNota | null {
  const conSaldo = filas.filter((f) => !valor(f).esCero());
  if (conSaldo.length === 0) return null;
  return {
    columnas: [titulo],
    renglones: [
      ...conSaldo.map((f) => ({ concepto: `${f.codigo} ${f.nombre}`, valores: [valor(f).aTexto()] })),
      { concepto: "Total", valores: [sumar(conSaldo.map(valor)).aTexto()], total: true },
    ],
  };
}

interface Contenido {
  titulo: string;
  sugerido: string;
  campos: CampoNota[];
  tabla: TablaNota | null;
}

/** Texto, cifras y tabla de cada nota según los saldos del período. */
function contenidoDe(
  clave: ClaveNota,
  empresa: DatosEmpresaNotas,
  filas: readonly FilaSaldos[],
  nombres: NombresDeMayor,
): Contenido {
  switch (clave) {
    case "entidad": {
      const actividad = empresa.actividadEconomica?.trim();
      return {
        titulo: "Entidad y actividad",
        sugerido:
          `${empresa.nombre} es una ${NOMBRE_CONTRIBUYENTE[empresa.tipoContribuyente]} constituida en El Salvador` +
          (actividad ? `, dedicada a ${actividad}.` : ".") +
          ` Opera con ${empresa.sucursalesActivas === 1 ? "una sucursal" : `${empresa.sucursalesActivas} sucursales`}.`,
        campos: [
          texto("NIT", empresa.nit),
          ...(empresa.nrc ? [texto("NRC", empresa.nrc)] : []),
          texto("Tipo de contribuyente", NOMBRE_CONTRIBUYENTE[empresa.tipoContribuyente]),
          texto("Sucursales", String(empresa.sucursalesActivas)),
        ],
        tabla: null,
      };
    }
    case "politicas":
      return {
        titulo: "Políticas contables",
        sugerido:
          "Los estados financieros se presentan en dólares de los Estados Unidos de América " +
          `${NOMBRE_FORMATO[empresa.formatoEstados]}. Los inventarios se valúan por el método de ` +
          `${NOMBRE_VALUACION[empresa.metodoValuacion]}, con sistema ${NOMBRE_SISTEMA[empresa.sistemaInventario]}. ` +
          "La propiedad, planta y equipo se registra al costo y se deprecia en línea recta durante su vida útil.",
        campos: [
          texto("Moneda", "US$"),
          texto(
            "Formato de estados",
            NOMBRE_FORMATO[empresa.formatoEstados].replace("con el formato de ", ""),
          ),
          texto("Valuación de inventarios", NOMBRE_VALUACION[empresa.metodoValuacion]),
          texto("Sistema de inventario", NOMBRE_SISTEMA[empresa.sistemaInventario]),
        ],
        tabla: null,
      };
    case "efectivo": {
      const cuentas = deMayores(filas, ["1101"]);
      const de = (prefijo: string) =>
        sumar(cuentas.filter((f) => f.codigo.startsWith(prefijo)).map(saldoFinal));
      return {
        titulo: "Efectivo y equivalentes",
        sugerido:
          "El efectivo y equivalentes comprende los fondos en caja, en caja chica y los saldos en cuentas bancarias.",
        campos: [
          dinero("Caja general", de("110101")),
          dinero("Caja chica", de("110102")),
          dinero("Bancos", de("110103")),
          dinero("Total", sumar(cuentas.map(saldoFinal))),
        ],
        tabla: tablaDeSaldos(cuentas, saldoFinal),
      };
    }
    case "inventarios": {
      const cuentas = deMayores(filas, ["1109", "1110"]);
      const inicial = sumar(cuentas.map((f) => Dinero.de(f.saldoInicial)));
      const entradas = sumar(cuentas.map((f) => Dinero.de(f.movimientoDebe)));
      const salidas = sumar(cuentas.map((f) => Dinero.de(f.movimientoHaber)));
      const final = sumar(cuentas.map(saldoFinal));
      const conMovimiento = cuentas.filter(
        (f) => !saldoFinal(f).esCero() || !Dinero.de(f.movimientoDebe).esCero(),
      );
      return {
        titulo: "Inventarios",
        sugerido:
          "Los inventarios corresponden a las mercaderías para la venta y se valúan al costo, según el método " +
          `de ${NOMBRE_VALUACION[empresa.metodoValuacion]}.`,
        campos: [
          dinero("Saldo inicial", inicial),
          dinero("Entradas del período", entradas),
          dinero("Salidas del período", salidas),
          dinero("Inventario final", final),
        ],
        tabla:
          conMovimiento.length === 0
            ? null
            : {
                columnas: ["Saldo inicial", "Entradas", "Salidas", "Saldo final"],
                renglones: [
                  ...conMovimiento.map((f) => ({
                    concepto: `${f.codigo} ${f.nombre}`,
                    valores: [
                      Dinero.de(f.saldoInicial).aTexto(),
                      Dinero.de(f.movimientoDebe).aTexto(),
                      Dinero.de(f.movimientoHaber).aTexto(),
                      saldoFinal(f).aTexto(),
                    ],
                  })),
                  {
                    concepto: "Total",
                    valores: [inicial, entradas, salidas, final].map((v) => v.aTexto()),
                    total: true,
                  },
                ],
              },
      };
    }
    case "activo-fijo": {
      const costo = deMayores(filas, ["1201"]);
      const depreciacion = deMayores(filas, ["1202", "1203"]);
      const totalCosto = sumar(costo.map(saldoFinal));
      const totalDepreciacion = sumar(depreciacion.map(acreedor));
      const renglones = [
        ...costo
          .filter((f) => !saldoFinal(f).esCero())
          .map((f) => ({ concepto: `Costo: ${f.nombre}`, valores: [saldoFinal(f).aTexto()] })),
        { concepto: "Costo total", valores: [totalCosto.aTexto()], total: true },
        ...depreciacion
          .filter((f) => !acreedor(f).esCero())
          .map((f) => ({
            concepto: `(−) Depreciación acumulada: ${f.nombre}`,
            valores: [acreedor(f).aTexto()],
          })),
        { concepto: "Depreciación acumulada total", valores: [totalDepreciacion.aTexto()], total: true },
        {
          concepto: "Valor en libros",
          valores: [totalCosto.menos(totalDepreciacion).aTexto()],
          total: true,
        },
      ];
      return {
        titulo: "Propiedad, planta y equipo",
        sugerido:
          "La propiedad, planta y equipo se registra al costo de adquisición o aportación, menos la depreciación " +
          "acumulada. La depreciación se calcula en línea recta desde que el bien está disponible para su uso.",
        campos: [
          dinero("Costo", totalCosto),
          dinero("Depreciación acumulada", totalDepreciacion),
          dinero("Valor en libros", totalCosto.menos(totalDepreciacion)),
        ],
        tabla: totalCosto.esCero() && totalDepreciacion.esCero() ? null : { columnas: ["Monto"], renglones },
      };
    }
    case "obligaciones": {
      const pasivos = filas.filter((f) => f.tipo === "pasivo");
      const de = (...mayores: string[]) => sumar(deMayores(pasivos, mayores).map(acreedor));
      const porMayor = new Map<string, Dinero>();
      for (const f of pasivos) {
        const m = mayorDe(f.codigo);
        porMayor.set(m, (porMayor.get(m) ?? Dinero.cero()).mas(acreedor(f)));
      }
      const renglonesMayor = [...porMayor]
        .filter(([, v]) => !v.esCero())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const total = sumar(pasivos.map(acreedor));
      const conocidas = de("2106", "2107", "2109", "2110", "2111");
      return {
        titulo: "Obligaciones por pagar",
        sugerido:
          "Las obligaciones comprenden las cuentas por pagar a proveedores, las retenciones y cuotas de seguridad " +
          "social, las provisiones de prestaciones laborales y los impuestos del período, que se pagan en los " +
          "plazos que fija la ley.",
        campos: [
          dinero("Retenciones por pagar", de("2106")),
          dinero("Obligaciones con empleados", de("2107")),
          dinero("Impuestos por pagar", de("2109", "2110", "2111")),
          ...(total.menos(conocidas).esCero() ? [] : [dinero("Otras obligaciones", total.menos(conocidas))]),
          dinero("Total", total),
        ],
        tabla:
          renglonesMayor.length === 0
            ? null
            : {
                columnas: ["Saldo"],
                renglones: [
                  ...renglonesMayor.map(([m, v]) => ({
                    concepto: `${m} ${nombres.get(m) ?? m}`,
                    valores: [v.aTexto()],
                  })),
                  { concepto: "Total", valores: [total.aTexto()], total: true },
                ],
              },
      };
    }
    case "capital": {
      const cuentas = deMayores(filas, ["3101", "3102"]);
      const total = sumar(cuentas.map(acreedor));
      const aportes = cuentas.filter((f) => !acreedor(f).esCero());
      return {
        titulo: "Capital",
        sugerido:
          empresa.tipoContribuyente === "sociedad"
            ? "El capital social está formado por los aportes de los accionistas."
            : "El capital está formado por los aportes del titular o de los socios.",
        campos: [dinero("Capital total", total), texto("Cuentas de capital", String(aportes.length))],
        tabla: tablaDeSaldos(cuentas, acreedor),
      };
    }
  }
}

/** Orden y numeración de las notas en el juego de estados. */
const ORDEN: readonly ClaveNota[] = [
  "entidad",
  "politicas",
  "efectivo",
  "inventarios",
  "activo-fijo",
  "obligaciones",
  "capital",
];

/**
 * Arma las notas a los estados financieros: el texto vigente de cada una (el que el contador guardó, o el que
 * propone el sistema con los datos de la empresa) junto con las cifras y tablas que el sistema llena con los
 * saldos de la balanza ajustada del período. Las cifras no se escriben a mano: cambian con la contabilidad.
 */
export function armarNotas(
  empresa: DatosEmpresaNotas,
  filas: readonly FilaSaldos[],
  nombres: NombresDeMayor,
  guardadas: ReadonlyMap<string, NotaGuardada>,
): NotaEstado[] {
  return ORDEN.map((clave, i) => {
    const c = contenidoDe(clave, empresa, filas, nombres);
    const guardada = guardadas.get(clave);
    return {
      clave,
      numero: i + 1,
      titulo: c.titulo,
      textoSugerido: c.sugerido,
      texto: guardada?.texto ?? c.sugerido,
      editada: guardada !== undefined && guardada.texto !== c.sugerido,
      version: guardada?.version ?? null,
      campos: c.campos,
      tabla: c.tabla,
    };
  });
}
