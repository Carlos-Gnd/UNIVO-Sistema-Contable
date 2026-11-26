import { describe, expect, it } from "vitest";
import { calcularLiquidacionIva, encadenarLiquidaciones, REMANENTE_CERO } from "./liquidacion-iva";

const mes = (debito: string, credito: string, percibido = "0", retenido = "0") => ({
  debitoFiscal: debito,
  creditoFiscal: credito,
  percibidoSufrido: percibido,
  retenidoSufrido: retenido,
});

describe("calcularLiquidacionIva", () => {
  it("CheroPhonex octubre: débito 5,986.67 menos crédito 5,343.00 da 643.67 por pagar", () => {
    const r = calcularLiquidacionIva({ ...mes("5986.67", "5343.00"), remanenteAnterior: REMANENTE_CERO });
    expect(r.ivaPorPagar).toBe("643.67");
    expect(r.usoCredito).toBe("5343.00");
    expect(r.remanenteTotal).toBe("0.00");
  });

  it("si el crédito supera al débito no hay IVA por pagar y la diferencia es remanente", () => {
    const r = calcularLiquidacionIva({ ...mes("13.00", "130.00"), remanenteAnterior: REMANENTE_CERO });
    expect(r.ivaPorPagar).toBe("0.00");
    expect(r.usoCredito).toBe("13.00");
    expect(r.remanente.credito).toBe("117.00");
    expect(r.remanenteTotal).toBe("117.00");
  });

  it("el remanente anterior se suma al crédito del mes", () => {
    const r = calcularLiquidacionIva({
      ...mes("100.00", "40.00"),
      remanenteAnterior: { credito: "35.00", percibido: "0.00", retenido: "0.00" },
    });
    expect(r.usoCredito).toBe("75.00");
    expect(r.ivaPorPagar).toBe("25.00");
    expect(r.remanenteAnterior.credito).toBe("35.00");
  });

  it("agota primero el crédito fiscal, luego el percibido y por último el retenido", () => {
    const r = calcularLiquidacionIva({
      ...mes("100.00", "50.00", "20.00", "40.00"),
      remanenteAnterior: REMANENTE_CERO,
    });
    expect([r.usoCredito, r.usoPercibido, r.usoRetenido]).toEqual(["50.00", "20.00", "30.00"]);
    expect(r.ivaPorPagar).toBe("0.00");
    expect(r.remanente).toEqual({ credito: "0.00", percibido: "0.00", retenido: "10.00" });
  });

  it("suma centavos exactos sin errores de coma flotante", () => {
    const r = calcularLiquidacionIva({
      ...mes("0.30", "0.10", "0.10"),
      remanenteAnterior: REMANENTE_CERO,
    });
    expect(r.ivaPorPagar).toBe("0.10");
  });

  it("un débito en cero deja todo el crédito como remanente", () => {
    const r = calcularLiquidacionIva({ ...mes("0", "50.00", "5.00"), remanenteAnterior: REMANENTE_CERO });
    expect(r.ivaPorPagar).toBe("0.00");
    expect(r.remanente).toEqual({ credito: "50.00", percibido: "5.00", retenido: "0.00" });
    expect(r.remanenteTotal).toBe("55.00");
  });
});

describe("encadenarLiquidaciones", () => {
  it("traslada el remanente de cada mes al siguiente", () => {
    const [nov, dic, ene] = encadenarLiquidaciones([
      mes("13.00", "130.00"),
      mes("65.00", "0"),
      mes("200.00", "0"),
    ]);
    expect(nov?.remanenteTotal).toBe("117.00");
    expect(dic?.remanenteAnterior.credito).toBe("117.00");
    expect(dic?.remanenteTotal).toBe("52.00");
    expect(ene?.ivaPorPagar).toBe("148.00");
    expect(ene?.remanenteTotal).toBe("0.00");
  });
});
