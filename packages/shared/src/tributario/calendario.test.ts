import { describe, expect, it } from "vitest";
import {
  DIAS_DE_ALERTA,
  diaDeLaSemana,
  enesimoDiaHabil,
  esDiaHabil,
  estadoDeVencimiento,
  fechaDeVencimiento,
  feriados,
  mesesDelRango,
  siguienteDiaHabil,
} from "./calendario";

describe("días hábiles", () => {
  it("los fines de semana y los asuetos no son hábiles", () => {
    expect(esDiaHabil("2026-11-07")).toBe(false); // sábado
    expect(esDiaHabil("2026-11-08")).toBe(false); // domingo
    expect(esDiaHabil("2026-11-02")).toBe(false); // Día de los Difuntos (lunes)
    expect(esDiaHabil("2026-12-25")).toBe(false); // Navidad (viernes)
    expect(esDiaHabil("2026-11-03")).toBe(true);
  });

  it("calcula la Semana Santa de cada año", () => {
    expect([...feriados(2026)].filter((f) => f.startsWith("2026-04"))).toEqual(["2026-04-02", "2026-04-03"]);
    expect([...feriados(2027)].filter((f) => f.startsWith("2027-03"))).toEqual(["2027-03-25", "2027-03-26"]);
  });

  it("el siguiente día hábil salta el fin de semana y los asuetos", () => {
    expect(siguienteDiaHabil("2026-11-07")).toBe("2026-11-09");
    expect(siguienteDiaHabil("2026-12-25")).toBe("2026-12-28");
    expect(siguienteDiaHabil("2026-11-09")).toBe("2026-11-09");
  });
});

describe("fecha de vencimiento: el décimo día hábil del mes siguiente", () => {
  it("noviembre de 2026 (con el asueto del 2 de noviembre): el F-07 de octubre vence el lunes 16", () => {
    expect(fechaDeVencimiento("f07", "2026-10")).toBe("2026-11-16");
    expect(diaDeLaSemana("2026-11-16")).toBe(1);
  });

  it("diciembre de 2026: el 14, sin fines de semana de por medio", () => {
    expect(fechaDeVencimiento("f07", "2026-11")).toBe("2026-12-14");
    expect(fechaDeVencimiento("f14", "2026-11")).toBe("2026-12-14");
    expect(fechaDeVencimiento("planilla", "2026-11")).toBe("2026-12-14");
  });

  it("enero de 2027: el 1 de enero es asueto y el décimo día hábil es el 15", () => {
    expect(fechaDeVencimiento("f07", "2026-12")).toBe("2027-01-15");
  });

  it("abril de 2026 con Jueves y Viernes Santo: el décimo día hábil es el 16 de abril", () => {
    // marzo de 2026 es el período; el mes de vencimiento es abril, con asueto el 2 y el 3
    expect(fechaDeVencimiento("f07", "2026-03")).toBe("2026-04-16");
  });

  it("nunca cae en fin de semana ni en asueto, en ningún mes de 2026 y 2027", () => {
    for (const periodo of mesesDelRango("2026-01", "2027-12")) {
      for (const o of ["f07", "f14", "planilla"] as const) {
        const f = fechaDeVencimiento(o, periodo);
        expect(esDiaHabil(f), `${o} ${periodo} → ${f}`).toBe(true);
        // y es el décimo hábil: no hay uno antes que lo sea diez veces
        expect(enesimoDiaHabil(f.slice(0, 7), 10)).toBe(f);
      }
    }
  });
});

describe("estado del vencimiento", () => {
  const fecha = "2026-12-14";
  it("presentada gana siempre, aunque ya haya vencido", () => {
    expect(estadoDeVencimiento(fecha, true, "2027-01-10")).toBe("presentada");
  });
  it("próxima cuando faltan cinco días o menos, contando el mismo día", () => {
    expect(DIAS_DE_ALERTA).toBe(5);
    expect(estadoDeVencimiento(fecha, false, "2026-12-09")).toBe("proxima"); // faltan 5
    expect(estadoDeVencimiento(fecha, false, "2026-12-14")).toBe("proxima"); // vence hoy
    expect(estadoDeVencimiento(fecha, false, "2026-12-08")).toBe("pendiente"); // faltan 6
  });
  it("vencida el día siguiente a la fecha", () => {
    expect(estadoDeVencimiento(fecha, false, "2026-12-15")).toBe("vencida");
  });
});
