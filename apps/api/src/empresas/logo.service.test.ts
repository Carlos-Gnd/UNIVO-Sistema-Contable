import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogoService } from "./logo.service.js";

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const upload = vi.fn();
  const getPublicUrl = vi.fn();
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  };
  const bucket = { upload, getPublicUrl };
  const storage = { from: vi.fn(() => bucket) };
  const client = { from: vi.fn(() => query), storage };
  const createClient = vi.fn(() => client);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  return { maybeSingle, upload, getPublicUrl, createClient };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

describe("LogoService", () => {
  const envOriginal = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_LOGOS_BUCKET: process.env.SUPABASE_LOGOS_BUCKET,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://ejemplo.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    delete process.env.SUPABASE_LOGOS_BUCKET;
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "membresia-1", rol: { codigo: "administrador" } },
      error: null,
    });
    mocks.upload.mockResolvedValue({ data: { path: "empresa/logo.png" }, error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://ejemplo.supabase.co/storage/v1/object/public/logos/logo.png" },
    });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envOriginal)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("sube el logotipo del administrador y devuelve su URL pública", async () => {
    const servicio = new LogoService();
    const file = {
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mimetype: "image/png",
      size: 8,
    };

    await expect(servicio.subirLogo("empresa-1", "usuario-1", file)).resolves.toEqual({
      url: "https://ejemplo.supabase.co/storage/v1/object/public/logos/logo.png",
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^empresa-1\/[0-9a-f-]+\.png$/),
      file.buffer,
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
  });

  it("rechaza archivos que no son imágenes permitidas", async () => {
    const servicio = new LogoService();

    await expect(
      servicio.subirLogo("empresa-1", "usuario-1", {
        buffer: Buffer.from("no es png"),
        mimetype: "image/png",
        size: 9,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rechaza a usuarios que no son administradores de la empresa", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "membresia-1", rol: { codigo: "contador" } },
      error: null,
    });
    const servicio = new LogoService();

    await expect(
      servicio.subirLogo("empresa-1", "usuario-1", {
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        mimetype: "image/png",
        size: 8,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("responde 503 si falta configurar la clave secreta", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const servicio = new LogoService();

    await expect(
      servicio.subirLogo("empresa-1", "usuario-1", {
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        mimetype: "image/png",
        size: 8,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
