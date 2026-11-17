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
    balanceGeneral: {
      totalActivo: string;
      totalPasivo: string;
      totalPatrimonio: string;
      capital: string;
      utilidadDelEjercicio: string;
    };
  };
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
}

/**
 * Carga el caso en una empresa nueva, dentro de una transacción: la empresa con su casa matriz y su ejercicio
 * 2026, el catálogo base de persona natural, las subcuentas del caso y las partidas contabilizadas en orden,
 * de modo que el sistema les asigna sus números correlativos. Si algo falla, no queda nada a medias.
 */
export async function cargarCasoCherophonex(
  c: pg.Client,
  caso: CasoCherophonex = leerCaso(),
): Promise<CasoCargado> {
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
    await c.query(
      `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, $2::int, make_date($2::int, 1, 1), make_date($2::int, 12, 31))`,
      [empresaId, caso.ejercicio],
    );
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
    await c.query("commit");
    return { empresaId, sucursalId, cuentas, partidas: caso.partidas.length };
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}
