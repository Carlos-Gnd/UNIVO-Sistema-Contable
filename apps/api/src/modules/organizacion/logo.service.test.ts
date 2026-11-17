import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogoService } from "./logo.service.js";

const mocks = vi.hoisted(() => {
  const queryRaw = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const comoUsuario = vi.fn();
  const upload = vi.fn();
  const remove = vi.fn();
  const getPublicUrl = vi.fn();
  const bucket = { upload, remove, getPublicUrl };
  const storage = { from: vi.fn(() => bucket) };
  const client = { storage };
  const createClient = vi.fn(() => client);
  const empresa = { findUnique, update };
  const prisma = { $queryRaw: queryRaw, empresa };
  const tx = { $queryRaw: queryRaw, empresa };
  const baseDatos = { prisma };

  return {
    queryRaw,
    findUnique,
    update,
    comoUsuario,
    upload,
    remove,
    getPublicUrl,
    storage,
    client,
    createClient,
    prisma,
    tx,
    baseDatos,
  };
});

vi.mock("@contable/db", () => ({
  comoUsuario: mocks.comoUsuario,
  crearPrisma: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

const muestrasValidas: [string, string, Buffer, string][] = [
  ["PNG", "image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "png"],
  ["JPG", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0]), "jpg"],
  ["WebP", "image/webp", Buffer.from("RIFF0000WEBP"), "webp"],
];

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
    mocks.queryRaw.mockResolvedValue([{ permitido: true }]);
    mocks.findUnique.mockResolvedValue({ logoUrl: null });
    mocks.update.mockResolvedValue({ id: "empresa-1" });
    mocks.comoUsuario.mockImplementation(async (_prisma, _usuarioId, fn) => fn(mocks.tx));
    mocks.upload.mockResolvedValue({ data: { path: "empresa-1/nuevo.png" }, error: null });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.getPublicUrl.mockImplementation((path) => ({
      data: { publicUrl: "https://ejemplo.supabase.co/storage/v1/object/public/logos/" + path },
    }));
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

  it("sube el logotipo, guarda su URL con auditoría y devuelve el enlace con versión", async () => {
    const servicio = new LogoService(mocks.baseDatos as never);
    const file = {
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mimetype: "image/png",
      size: 8,
    };

    const result = await servicio.subirLogo("empresa-1", "usuario-1", file);

    expect(result.url).toMatch(
      /^https:\/\/ejemplo\.supabase\.co\/storage\/v1\/object\/public\/logos\/empresa-1\/[0-9a-f-]+\.png\?v=\d+$/,
    );
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^empresa-1\/[0-9a-f-]+\.png$/),
      file.buffer,
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
    expect(mocks.comoUsuario).toHaveBeenCalledWith(mocks.prisma, "usuario-1", expect.any(Function));
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: { logoUrl: result.url },
    });
  });

  it("rechaza archivos con MIME permitido pero bytes de otro tipo", async () => {
    const servicio = new LogoService(mocks.baseDatos as never);

    await expect(
      servicio.subirLogo("empresa-1", "usuario-1", {
        buffer: Buffer.from("no es png"),
        mimetype: "image/png",
        size: 9,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it.each(muestrasValidas)(
    "acepta los bytes de una imagen %s",
    async (_nombre, mimetype, buffer, extension) => {
      const servicio = new LogoService(mocks.baseDatos as never);

      await servicio.subirLogo("empresa-1", "usuario-1", {
        buffer,
        mimetype,
        size: buffer.byteLength,
      });

      expect(mocks.upload).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp("^empresa-1/[0-9a-f-]+\\." + extension + "$")),
        buffer,
        expect.any(Object),
      );
    },
  );

  it("rechaza archivos mayores a 2 MB en el servicio", async () => {
    const servicio = new LogoService(mocks.baseDatos as never);

    await expect(
      servicio.subirLogo("empresa-1", "usuario-1", {
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        mimetype: "image/png",
        size: 2 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requiere el permiso empresa.configurar", async () => {
    mocks.queryRaw.mockResolvedValue([{ permitido: false }]);
    const servicio = new LogoService(mocks.baseDatos as never);

    await expect(
      servicio.subirLogo("empresa-1", "usuario-1", {
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        mimetype: "image/png",
        size: 8,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("elimina el logo anterior después de guardar el nuevo", async () => {
    mocks.findUnique.mockResolvedValue({
      logoUrl: "https://ejemplo.supabase.co/storage/v1/object/public/logos/empresa-1/anterior.jpg?v=1",
    });
    const servicio = new LogoService(mocks.baseDatos as never);

    await servicio.subirLogo("empresa-1", "usuario-1", {
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mimetype: "image/png",
      size: 8,
    });

    expect(mocks.remove).toHaveBeenCalledWith(["empresa-1/anterior.jpg"]);
  });

  it("limpia el archivo nuevo si no logra guardar la URL en la empresa", async () => {
    mocks.comoUsuario.mockRejectedValue(new Error("database error"));
    const servicio = new LogoService(mocks.baseDatos as never);

    await expect(
      servicio.subirLogo("empresa-1", "usuario-1", {
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        mimetype: "image/png",
        size: 8,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocks.remove).toHaveBeenCalledWith([expect.stringMatching(/^empresa-1\/[0-9a-f-]+\.png$/)]);
  });

  it("responde 503 si falta configurar la clave secreta", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const servicio = new LogoService(mocks.baseDatos as never);

    await expect(
      servicio.subirLogo("empresa-1", "usuario-1", {
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        mimetype: "image/png",
        size: 8,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
