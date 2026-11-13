import { describe, expect, it } from "vitest";
import { campoDuplicado } from "./repositorio-empresas.prisma.js";

describe("campoDuplicado", () => {
  it("lee el índice que envía el adaptador de pg (Prisma 7)", () => {
    const error = {
      code: "P2002",
      meta: {
        modelName: "Empresa",
        driverAdapterError: {
          name: "DriverAdapterError",
          cause: {
            originalCode: "23505",
            kind: "UniqueConstraintViolation",
            constraint: { index: "empresas_nit_key" },
            table: "empresas",
          },
        },
      },
    };
    expect(campoDuplicado(error)).toBe("nit");
    expect(campoDuplicado({ code: "P2002", meta: { target: ["correo"] } })).toBe("correo");
  });

  it("ignora otros errores", () => {
    expect(campoDuplicado(new Error("x"))).toBeNull();
    expect(campoDuplicado({ code: "P2025" })).toBeNull();
    expect(campoDuplicado({ code: "P2002", meta: { target: ["otro"] } })).toBe("desconocido");
  });
});
