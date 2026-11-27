import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generarHistorialDemo, cargarCasoCherophonex, leerCaso } from "../src/casos/cherophonex";
import { basePropia, reiniciarBase } from "./helpers";

type LineaEsperada = { orden: number; cuenta: string; debe: string; haber: string };
type PartidaEsperada = {
  ambito: string;
  numero: number;
  fecha: string;
  tipo: string;
  concepto: string;
  estado: string;
  lineas: LineaEsperada[];
};

const caso = leerCaso();

/** PostgreSQL devuelve numeric(18, 2) con dos decimales, incluso cuando el caso usa "0". */
const importeNormalizado = (valor: string) => {
  const [entero, centavos = ""] = valor.split(".");
  return `${entero}.${centavos.padEnd(2, "0")}`;
};

function casoEsperado(): PartidaEsperada[] {
  const correlativos = new Map<string, number>();
  return [...generarHistorialDemo(), ...caso.partidas].map((partida) => {
    const ambito = partida.fecha.slice(0, 4);
    const numero = (correlativos.get(ambito) ?? 0) + 1;
    correlativos.set(ambito, numero);
    return {
      ambito,
      numero,
      fecha: partida.fecha,
      tipo: partida.tipo,
      concepto: partida.concepto,
      estado: "contabilizada",
      lineas: partida.lineas.map((linea, orden) => ({
        orden,
        cuenta: linea.cuenta,
        debe: importeNormalizado(linea.debe),
        haber: importeNormalizado(linea.haber),
      })),
    };
  });
}

async function leerPartidas(c: Awaited<ReturnType<typeof reiniciarBase>>, empresaId: string) {
  const resultado = await c.query<PartidaEsperada>(
    `select p.ambito_numeracion as ambito, p.numero, p.fecha::text as fecha,
            p.tipo::text as tipo, p.concepto, p.estado::text as estado,
            json_agg(json_build_object(
              'orden', d.orden, 'cuenta', cuenta.codigo,
              'debe', d.debe::text, 'haber', d.haber::text
            ) order by d.orden) as lineas
     from partidas p
     join partida_detalles d on d.partida_id = p.id
     join cuentas cuenta on cuenta.id = d.cuenta_id
     where p.empresa_id = $1
     group by p.id
     order by p.fecha, p.ambito_numeracion, p.numero`,
    [empresaId],
  );
  return resultado.rows.map((partida) => ({
    ...partida,
    lineas: partida.lineas.map((linea) => ({
      ...linea,
      debe: importeNormalizado(linea.debe),
      haber: importeNormalizado(linea.haber),
    })),
  }));
}

describe("reinicio de la demostración: restaura exactamente el caso inicial", () => {
  let c: Awaited<ReturnType<typeof reiniciarBase>>;
  let url: string;

  beforeAll(async () => {
    url = await basePropia("contable_db_reinicio_demo_exacto");
    c = await reiniciarBase(url);
  });

  afterAll(async () => {
    await c?.end();
  });

  it("reconstruye ejercicios, movimientos, correlativos y líneas con los datos originales", async () => {
    const cargar = async () => {
      const carga = await cargarCasoCherophonex(c, caso, { activosFijos: true, historialDemo: true });
      expect(carga.partidas).toBe(44);
      expect(carga.movimientosHistoricos).toBe(94);
      return leerPartidas(c, carga.empresaId);
    };

    const primeraCarga = await cargar();
    expect(primeraCarga).toEqual(casoEsperado());

    await c.end();
    c = await reiniciarBase(url);
    const segundaCarga = await cargar();
    expect(segundaCarga).toEqual(primeraCarga);

    const ejercicios = await c.query<{ anio: number }>(`select anio from ejercicios order by anio`);
    expect(ejercicios.rows.map((fila) => fila.anio)).toEqual([2024, 2025, 2026]);
  });
});
