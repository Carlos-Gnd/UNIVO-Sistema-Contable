import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AuthApiError,
  AuthSessionMissingError,
  type AuthChangeEvent,
  type Session,
} from "@supabase/supabase-js";
import { App } from "@/App";
import { simularApi } from "@/test/api-simulada";
import type { AuthCliente } from "./cliente-supabase";
import { traducirErrorAuth } from "./errores";
import { recordarRuta, rutaInicial } from "./ruta-inicial";
import { iniciales, usuarioDeSesion } from "./usuario";

const sesionDe = (correo: string, nombre?: string) =>
  ({
    access_token: `token-de-${correo}`,
    user: { id: `id-${correo}`, email: correo, user_metadata: nombre ? { nombre } : {} },
  }) as unknown as Session;

/** Supabase Auth en memoria: la contraseña válida es "secreta123". */
function simularAuth(inicial: Session | null = null) {
  let sesion = inicial;
  const oyentes = new Set<(evento: AuthChangeEvent, sesion: Session | null) => void>();
  const emitir = (evento: AuthChangeEvent, nueva: Session | null) => {
    sesion = nueva;
    oyentes.forEach((oyente) => oyente(evento, nueva));
  };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: sesion }, error: null })),
    onAuthStateChange: vi.fn((oyente: (evento: AuthChangeEvent, sesion: Session | null) => void) => {
      oyentes.add(oyente);
      return { data: { subscription: { unsubscribe: () => void oyentes.delete(oyente) } } };
    }),
    signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
      if (password !== "secreta123")
        return { error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials") };
      emitir("SIGNED_IN", sesionDe(email, "María Rivas"));
      return { error: null };
    }),
    signOut: vi.fn(async () => {
      emitir("SIGNED_OUT", null);
      return { error: null };
    }),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: sesion ? null : new AuthSessionMissingError() })),
  } satisfies AuthCliente;
  return auth;
}

const PERMISOS = {
  rol: "administrador",
  todasSucursales: true,
  sucursales: [],
  permisos: ["empresa.ver", "sucursales.ver"],
};

function irA(ruta: string) {
  window.history.replaceState(null, "", ruta);
}

async function iniciarSesion(usuario: ReturnType<typeof userEvent.setup>, contrasena = "secreta123") {
  await usuario.type(await screen.findByLabelText("Correo electrónico"), "maria@gmail.com");
  await usuario.type(screen.getByPlaceholderText("Escribe tu contraseña"), contrasena);
  await usuario.click(screen.getByRole("button", { name: "Entrar" }));
}

beforeEach(() => irA("/"));
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("inicio de sesión", () => {
  it("con credenciales incorrectas muestra un mensaje claro", async () => {
    const usuario = userEvent.setup();
    render(<App auth={simularAuth()} />);

    await iniciarSesion(usuario, "otra");

    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });

  it("al entrar lleva a registrar una empresa si el usuario aún no ha abierto ninguna", async () => {
    const usuario = userEvent.setup();
    const auth = simularAuth();
    render(<App auth={auth} />);

    await iniciarSesion(usuario);

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "maria@gmail.com",
      password: "secreta123",
    });
    await waitFor(() => expect(window.location.pathname).toBe("/empresas/nueva"));
  });

  it("una pantalla del sistema pide iniciar sesión y, al entrar, se abre con el token en cada petición", async () => {
    irA("/empresas/e1/sucursales");
    const peticiones = simularApi({
      "GET /empresas/e1/mis-permisos": { cuerpo: PERMISOS },
      "GET /empresas/e1/sucursales": { cuerpo: [] },
    });
    const usuario = userEvent.setup();
    render(<App auth={simularAuth()} />);

    await iniciarSesion(usuario);

    expect(await screen.findByRole("heading", { name: "Sucursales" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/empresas/e1/sucursales");
    expect(peticiones.length).toBeGreaterThan(0);
    for (const peticion of peticiones)
      expect(peticion.cabeceras.Authorization).toBe("Bearer token-de-maria@gmail.com");
  });

  it("sin Supabase configurado avisa qué falta", async () => {
    const usuario = userEvent.setup();
    render(<App auth={null} />);

    await iniciarSesion(usuario);

    expect(await screen.findByText(/Falta configurar Supabase en la web/)).toBeInTheDocument();
  });
});

describe("sesión iniciada", () => {
  it("al recargar conserva la sesión y vuelve a la última pantalla que abrió el usuario", async () => {
    const sesion = sesionDe("maria@gmail.com");
    recordarRuta(sesion.user.id, "/empresas/e1/sucursales");
    simularApi({
      "GET /empresas/e1/mis-permisos": { cuerpo: PERMISOS },
      "GET /empresas/e1/sucursales": { cuerpo: [] },
    });
    render(<App auth={simularAuth(sesion)} />);

    expect(await screen.findByRole("heading", { name: "Sucursales" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/empresas/e1/sucursales");
  });

  it("muestra al usuario en el encabezado y cierra la sesión desde ahí", async () => {
    irA("/empresas/e1/sucursales");
    simularApi({
      "GET /empresas/e1/mis-permisos": { cuerpo: PERMISOS },
      "GET /empresas/e1/sucursales": { cuerpo: [] },
    });
    const usuario = userEvent.setup();
    const auth = simularAuth(sesionDe("maria.rivas@gmail.com", "María Rivas"));
    render(<App auth={auth} />);

    const avatar = await screen.findByRole("button", { name: "Cuenta de usuario" });
    expect(avatar).toHaveTextContent("MR");
    await usuario.click(avatar);
    expect(screen.getByText("maria.rivas@gmail.com")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(auth.signOut).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("el menú principal muestra al usuario con el botón Salir", async () => {
    irA("/empresas/e1/sucursales");
    simularApi({
      "GET /empresas/e1/mis-permisos": { cuerpo: PERMISOS },
      "GET /empresas/e1/sucursales": { cuerpo: [] },
    });
    const usuario = userEvent.setup();
    const auth = simularAuth(sesionDe("maria@gmail.com", "María Rivas"));
    render(<App auth={auth} />);

    await usuario.click(await screen.findByRole("button", { name: "Abrir menú" }));
    const menu = screen.getByRole("dialog", { name: "Menú principal" });
    expect(within(menu).getByText("María Rivas")).toBeInTheDocument();
    await usuario.click(within(menu).getByRole("button", { name: "Cerrar sesión" }));

    expect(auth.signOut).toHaveBeenCalled();
  });

  it("si la API rechaza el token, cierra la sesión", async () => {
    irA("/empresas/e1/sucursales");
    simularApi({
      "GET /empresas/e1/mis-permisos": { estado: 401, cuerpo: { message: "Token inválido" } },
      "GET /empresas/e1/sucursales": { estado: 401, cuerpo: { message: "Token inválido" } },
    });
    const auth = simularAuth(sesionDe("maria@gmail.com"));
    render(<App auth={auth} />);

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });
});

describe("recuperación de contraseña", () => {
  it("envía el enlace que lleva a crear la contraseña nueva", async () => {
    irA("/recuperar");
    const usuario = userEvent.setup();
    const auth = simularAuth();
    render(<App auth={auth} />);

    await usuario.type(await screen.findByLabelText("Correo electrónico"), "maria@gmail.com");
    await usuario.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByText("Revisa tu correo")).toBeInTheDocument();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("maria@gmail.com", {
      redirectTo: `${window.location.origin}/cambiar-contrasena`,
    });
  });

  it("con el enlace vencido explica cómo pedir otro", async () => {
    irA("/cambiar-contrasena");
    const usuario = userEvent.setup();
    render(<App auth={simularAuth()} />);

    await usuario.type(await screen.findByPlaceholderText("Escribe tu nueva contraseña"), "nueva-clave-1");
    await usuario.type(screen.getByPlaceholderText("Escríbela otra vez"), "nueva-clave-1");
    await usuario.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByText(/El enlace venció o ya se usó/)).toBeInTheDocument();
  });

  it("con la sesión del enlace guarda la contraseña y entra al sistema", async () => {
    irA("/cambiar-contrasena");
    const usuario = userEvent.setup();
    const auth = simularAuth(sesionDe("maria@gmail.com"));
    render(<App auth={auth} />);

    await usuario.type(await screen.findByPlaceholderText("Escribe tu nueva contraseña"), "nueva-clave-1");
    await usuario.type(screen.getByPlaceholderText("Escríbela otra vez"), "nueva-clave-1");
    await usuario.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(auth.updateUser).toHaveBeenCalledWith({ password: "nueva-clave-1" });
    await waitFor(() => expect(window.location.pathname).toBe("/empresas/nueva"));
  });
});

describe("utilidades de sesión", () => {
  it("toma el nombre de los metadatos o, si no hay, del correo", () => {
    expect(usuarioDeSesion(sesionDe("maria@gmail.com", "María Rivas"))).toMatchObject({
      nombre: "María Rivas",
      iniciales: "MR",
      correo: "maria@gmail.com",
    });
    expect(usuarioDeSesion(sesionDe("jose.perez@gmail.com"))).toMatchObject({
      nombre: "jose.perez",
      iniciales: "JP",
    });
    expect(iniciales("Contador")).toBe("CO");
  });

  it("traduce los errores conocidos de Supabase y deja pasar los demás", () => {
    expect(traducirErrorAuth(new AuthApiError("x", 400, "email_not_confirmed"))?.message).toMatch(
      /Confirma tu correo/,
    );
    expect(traducirErrorAuth(new AuthApiError("x", 429, undefined))?.message).toMatch(/Demasiados intentos/);
    expect(traducirErrorAuth(new AuthApiError("x", 500, "unexpected_failure"))).toBeNull();
  });

  it("la ruta inicial ignora pantallas que ya no existen", () => {
    recordarRuta("u1", "/pantalla/que/ya/no/existe");
    expect(rutaInicial("u1")).toBe("/empresas/nueva");
  });
});
