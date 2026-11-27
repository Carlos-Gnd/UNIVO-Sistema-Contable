import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { LoginScreen } from "@/components/auth/login-screen";
import { PasswordRecoveryScreen } from "@/components/auth/password-recovery-screen";
import { PasswordResetScreen } from "@/components/auth/password-reset-screen";
import {
  useEtiquetasCambioContrasena,
  useEtiquetasLogin,
  useEtiquetasRecuperacion,
} from "@/components/auth/etiquetas";
import { i18n, cambiarIdioma } from ".";
import { PantallaBitacora } from "@/modules/auditoria/pantalla-bitacora";
import { PantallaImportacion } from "@/modules/importacion/pantalla-importacion";
import { PantallaPendientes } from "@/modules/contabilidad/pendientes/pantalla-pendientes";
import { PantallaUsuarios } from "@/modules/organizacion/usuarios/pantalla-usuarios";
import { simularApi } from "@/test/api-simulada";
import { renderizar } from "@/test/render";

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await i18n.changeLanguage("es");
});

async function elegirIngles() {
  await act(async () => cambiarIdioma("en"));
}

function LoginTraducido() {
  return <LoginScreen labels={useEtiquetasLogin()} />;
}

function RecuperacionTraducida() {
  return <PasswordRecoveryScreen labels={useEtiquetasRecuperacion()} />;
}

function CambioContrasenaTraducido() {
  return <PasswordResetScreen labels={useEtiquetasCambioContrasena()} />;
}

describe("pantallas traducidas", () => {
  it("muestra en inglés las pantallas de acceso", async () => {
    await elegirIngles();
    const { unmount: desmontarLogin } = renderizar(<LoginTraducido />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    desmontarLogin();

    renderizar(<RecuperacionTraducida />);
    expect(screen.getByRole("heading", { name: "Recover your password" })).toBeInTheDocument();
    cleanup();

    renderizar(<CambioContrasenaTraducido />);
    expect(screen.getByRole("heading", { name: "Create a new password" })).toBeInTheDocument();
  });

  it("muestra la bitácora en inglés", async () => {
    await elegirIngles();
    simularApi({
      "GET /empresas/e1/bitacora": {
        cuerpo: { registros: [], total: 0, pagina: 1, porPagina: 25, paginas: 1 },
      },
    });
    renderizar(<PantallaBitacora parametros={{ empresaId: "e1" }} />, { permisos: ["bitacora.ver"] });

    expect(await screen.findByRole("heading", { name: "Audit log" })).toBeInTheDocument();
  });

  it("muestra la importación en inglés", async () => {
    await elegirIngles();
    renderizar(<PantallaImportacion parametros={{ empresaId: "e1" }} />, {
      permisos: ["catalogo.importar"],
    });

    expect(screen.getByRole("heading", { name: "Import from Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("muestra la bandeja de pendientes en inglés", async () => {
    await elegirIngles();
    simularApi({
      "GET /empresas/e1/partidas/borradores": { cuerpo: [] },
      "GET /empresas/e1/sucursales": { cuerpo: [] },
    });
    renderizar(<PantallaPendientes parametros={{ empresaId: "e1" }} />, { permisos: ["partidas.ver"] });

    expect(await screen.findByRole("heading", { name: "Pending entries" })).toBeInTheDocument();
    expect(await screen.findByText("There are no pending entries.")).toBeInTheDocument();
  });

  it("muestra usuarios en inglés", async () => {
    await elegirIngles();
    simularApi({
      "GET /empresas/e1/usuarios": { cuerpo: [] },
      "GET /empresas/e1/sucursales": { cuerpo: [] },
    });
    renderizar(<PantallaUsuarios parametros={{ empresaId: "e1" }} />);

    expect(await screen.findByRole("heading", { name: "Users and roles" })).toBeInTheDocument();
    expect(await screen.findByText("This company has no users yet.")).toBeInTheDocument();
  });
});
