// Caso CheroPhonex (octubre 2026): carga completa en la base de datos (HU-90, S2-T49).
//
// El caso es el ejercicio consolidado de la clase: una persona natural que compra y vende teléfonos, con su
// apertura, 33 partidas de operación, 6 ajustes y 4 de cierre. Los datos salen de cherophonex.json, generado a
// partir del modelo del ejercicio (outputs/2026-11-05/fuente/exportar_caso_json.py), que también calcula,
// de forma independiente del sistema, los resultados esperados (balanzas, estado de resultados y balance).
import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

export interface LineaCaso {
  cuenta: string;
  debe: string;
  haber: string;
}

export interface PartidaCaso {
  numero: number;
  /** AAAA-MM-DD */
  fecha: string;
  tipo: "apertura" | "operacion" | "ajuste" | "cierre";
  concepto: string;
  lineas: LineaCaso[];
}

/** Producto del caso con su compra de octubre y las unidades vendidas por fecha de documento (kardex). */
export interface ProductoCaso {
  codigo: string;
  nombre: string;
  categoria: string;
  compra: { fecha: string; cantidad: number; costoUnitario: string };
  ventas: { fecha: string; cantidad: number }[];
}

export interface CuentaEsperada {
  debe: string;
  haber: string;
  saldoDeudor: string;
  saldoAcreedor: string;
}

export interface BalanzaEsperada {
  cuentas: Record<string, CuentaEsperada>;
  totales: { debe: string; haber: string; saldoDeudor: string; saldoAcreedor: string };
}

export interface CasoCherophonex {
  empresa: { nombre: string; nit: string; tipoContribuyente: "persona_natural" };
  ejercicio: number;
  subcuentas: { codigo: string; nombre: string }[];
  partidas: PartidaCaso[];
  inventario: ProductoCaso[];
  esperado: {
    balanzas: Record<"antes-ajustes" | "ajustada" | "posterior-cierre", BalanzaEsperada>;
    estadoDeResultados: {
      ventasNetas: string;
      costoDeVentas: string;
      utilidadBruta: string;
      gastosAdministracion: string;
      gastosVenta: string;
      gastosFinancieros: string;
      utilidadNeta: string;
    };
    inventario: {
      unidadesCompradas: number;
      unidadesVendidas: number;
      costoDeVentas: string;
      existenciasFinales: string;
    };
    balanceGeneral: {
      totalActivo: string;
      totalPasivo: string;
      totalPatrimonio: string;
      capital: string;
      utilidadDelEjercicio: string;
    };
  };
}

const centavosComoTexto = (centavos: number): string =>
  `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;

/** Genera movimientos contables deterministas para los 23 meses previos al caso académico de octubre de 2026. */
export function generarHistorialDemo(): PartidaCaso[] {
  const estacionalidad = [92, 96, 100, 104, 108, 112, 108, 94, 98, 102, 118, 132];
  const partidas: PartidaCaso[] = [];
  let numero = 1;
  const resultadoAnual = new Map<number, { ventas: number; costo: number; gasto: number }>();

  for (let indice = 0; indice < 23; indice++) {
    const fechaMes = new Date(Date.UTC(2024, 10 + indice, 1));
    const anio = fechaMes.getUTCFullYear();
    const mes = fechaMes.getUTCMonth();
    const factor = estacionalidad[mes]!;
    const base = 2_000_000 + ((anio * 31 + mes * 17) % 500_000);
    const ventas = Math.round((base * factor) / 100);
    const costo = Math.round((ventas * 68) / 100);
    const compra = costo;
    const gasto = Math.round((ventas * 12) / 100);
    const acumulado = resultadoAnual.get(anio) ?? { ventas: 0, costo: 0, gasto: 0 };
    acumulado.ventas += ventas;
    acumulado.costo += costo;
    acumulado.gasto += gasto;
    resultadoAnual.set(anio, acumulado);
    const periodo = `${anio}-${String(mes + 1).padStart(2, "0")}`;
    const fecha = `${periodo}-15`;
    const partida = (
      concepto: string,
      lineas: PartidaCaso["lineas"],
      fechaPartida = fecha,
      tipo: PartidaCaso["tipo"] = "operacion",
    ): void => {
      partidas.push({ numero: numero++, fecha: fechaPartida, tipo, concepto, lineas });
    };

    partida(`Ventas de demostración ${periodo}`, [
      { cuenta: "110101", debe: centavosComoTexto(ventas), haber: "0.00" },
      { cuenta: "510101", debe: "0.00", haber: centavosComoTexto(ventas) },
    ]);
    partida(`Compra de inventario ${periodo}`, [
      { cuenta: "1109", debe: centavosComoTexto(compra), haber: "0.00" },
      { cuenta: "110101", debe: "0.00", haber: centavosComoTexto(compra) },
    ]);
    partida(`Costo de ventas ${periodo}`, [
      { cuenta: "4104", debe: centavosComoTexto(costo), haber: "0.00" },
      { cuenta: "1109", debe: "0.00", haber: centavosComoTexto(costo) },
    ]);
    partida(`Gastos de administración ${periodo}`, [
      { cuenta: "420134", debe: centavosComoTexto(gasto), haber: "0.00" },
      { cuenta: "110101", debe: "0.00", haber: centavosComoTexto(gasto) },
    ]);

    if (mes === 11) {
      const anual = resultadoAnual.get(anio)!;
      partida(
        `Cierre de resultados ${anio}`,
        [
          { cuenta: "510101", debe: centavosComoTexto(anual.ventas), haber: "0.00" },
          { cuenta: "4104", debe: "0.00", haber: centavosComoTexto(anual.costo) },
          { cuenta: "420134", debe: "0.00", haber: centavosComoTexto(anual.gasto) },
          {
            cuenta: "3106",
            debe: "0.00",
            haber: centavosComoTexto(anual.ventas - anual.costo - anual.gasto),
          },
        ],
        `${anio}-12-31`,
        "cierre",
      );
    }
  }

  return partidas;
}

export function leerCaso(): CasoCherophonex {
  const archivo = path.resolve(import.meta.dirname, "cherophonex.json");
  return JSON.parse(readFileSync(archivo, "utf8")) as CasoCherophonex;
}

export interface CasoCargado {
  empresaId: string;
  sucursalId: string;
  /** id de cada cuenta por su código */
  cuentas: Record<string, string>;
  partidas: number;
  movimientosHistoricos: number;
}

/**
 * Carga el caso en una empresa nueva, dentro de una transacción: la empresa con su casa matriz y su ejercicio
 * 2026, el catálogo base de persona natural, las subcuentas del caso y las partidas contabilizadas en orden,
 * de modo que el sistema les asigna sus números correlativos. Si algo falla, no queda nada a medias.
 */
export async function cargarCasoCherophonex(
  c: pg.Client,
  caso: CasoCherophonex = leerCaso(),
  { activosFijos = false, historialDemo = false }: { activosFijos?: boolean; historialDemo?: boolean } = {},
): Promise<CasoCargado> {
  const movimientosHistoricos = historialDemo ? generarHistorialDemo() : [];
  await c.query("begin");
  try {
    const empresa = await c.query<{ id: string }>(
      `insert into empresas (nombre, nit, tipo_contribuyente) values ($1, $2, $3) returning id`,
      [caso.empresa.nombre, caso.empresa.nit, caso.empresa.tipoContribuyente],
    );
    const empresaId = empresa.rows[0]!.id;
    const sucursal = await c.query<{ id: string }>(
      `insert into sucursales (empresa_id, nombre, codigo_establecimiento, es_matriz) values ($1, 'Casa matriz', 'M001', true) returning id`,
      [empresaId],
    );
    const sucursalId = sucursal.rows[0]!.id;
    const anios = historialDemo ? [2024, 2025, caso.ejercicio] : [caso.ejercicio];
    for (const anio of anios) {
      await c.query(
        `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, $2::int, make_date($2::int, 1, 1), make_date($2::int, 12, 31))`,
        [empresaId, anio],
      );
    }
    await c.query(`select interno.copiar_catalogo_base($1)`, [empresaId]);

    // Las subcuentas heredan naturaleza y tipo de su cuenta de mayor (los primeros 4 dígitos del código)
    for (const s of caso.subcuentas) {
      await c.query(
        `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo)
         select $1, $2::varchar, $3, p.naturaleza, p.tipo from cuentas p where p.empresa_id = $1 and p.codigo = left($2::varchar, 4)`,
        [empresaId, s.codigo, s.nombre],
      );
    }
    const cuentas: Record<string, string> = {};
    const catalogo = await c.query<{ id: string; codigo: string }>(
      `select id, codigo from cuentas where empresa_id = $1`,
      [empresaId],
    );
    for (const f of catalogo.rows) cuentas[f.codigo] = f.id;

    if (historialDemo) {
      for (const movimiento of movimientosHistoricos) {
        const partida = await c.query<{ id: string }>(
          `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto) values ($1, $2, $3::date, $4::tipo_partida, $5) returning id`,
          [empresaId, sucursalId, movimiento.fecha, movimiento.tipo, movimiento.concepto],
        );
        const id = partida.rows[0]!.id;
        for (const [orden, linea] of movimiento.lineas.entries()) {
          const cuentaId = cuentas[linea.cuenta];
          if (!cuentaId) throw new Error(`No existe la cuenta ${linea.cuenta} para el historial demo`);
          await c.query(
            `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values ($1, $2, $3, $4, $5)`,
            [id, cuentaId, linea.debe, linea.haber, orden],
          );
        }
        await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [id]);
      }
    }

    for (const p of caso.partidas) {
      const partida = await c.query<{ id: string }>(
        `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto) values ($1, $2, $3::date, $4::tipo_partida, $5) returning id`,
        [empresaId, sucursalId, p.fecha, p.tipo, p.concepto],
      );
      const id = partida.rows[0]!.id;
      let orden = 0;
      for (const l of p.lineas) {
        const cuentaId = cuentas[l.cuenta];
        if (!cuentaId)
          throw new Error(`La partida ${p.numero} usa la cuenta ${l.cuenta}, que no existe en el catálogo`);
        await c.query(
          `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values ($1, $2, $3, $4, $5)`,
          [id, cuentaId, l.debe, l.haber, orden++],
        );
      }
      await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [id]);
    }
    if (activosFijos) await registrarActivoDelCaso(c, caso, empresaId, sucursalId, cuentas);
    await c.query("commit");
    return {
      empresaId,
      sucursalId,
      cuentas,
      partidas: caso.partidas.length,
      movimientosHistoricos: movimientosHistoricos.length,
    };
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

/**
 * Registra en activos_fijos el mobiliario y equipo del caso (HU-81 y HU-82), con la depreciación que la partida de
 * ajuste de octubre ya contabiliza: así «Generar depreciación» continúa en noviembre y no duplica octubre.
 * Si el esquema aún no tiene la tabla (migración sin aplicar) o el caso no trae esa partida, no hace nada.
 */
async function registrarActivoDelCaso(
  c: pg.Client,
  caso: CasoCherophonex,
  empresaId: string,
  sucursalId: string,
  cuentas: Record<string, string>,
): Promise<void> {
  const tabla = await c.query<{ existe: string | null }>(
    `select to_regclass('public.activos_fijos') as existe`,
  );
  if (!tabla.rows[0]?.existe) return;
  const apertura = caso.partidas.find((p) => p.tipo === "apertura");
  const costo = apertura?.lineas.find((l) => l.cuenta === "120105")?.debe;
  const ajuste = caso.partidas.find(
    (p) =>
      p.tipo === "ajuste" && p.lineas.some((l) => l.cuenta === "120204") && /depreciaci/i.test(p.concepto),
  );
  const acumulada = ajuste?.lineas.find((l) => l.cuenta === "120204")?.haber;
  if (!apertura || !costo || !ajuste || !acumulada) return;
  await c.query(
    `insert into activos_fijos (empresa_id, sucursal_id, nombre, categoria, cuenta_activo_id, cuenta_depreciacion_id,
       cuenta_gasto_id, costo, fecha_adquisicion, vida_util_anios, depreciacion_acumulada, ultimo_mes_depreciado)
     values ($1, $2, 'Mobiliario y equipo', 'mobiliario_equipo', $3, $4, $5, $6, $7::date, 2, $8, date_trunc('month', $9::date))`,
    [
      empresaId,
      sucursalId,
      cuentas["120105"],
      cuentas["120204"],
      cuentas["420122"],
      costo,
      apertura.fecha,
      acumulada,
      ajuste.fecha,
    ],
  );
}
