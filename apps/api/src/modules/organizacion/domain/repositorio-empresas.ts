import type { CrearEmpresa, EditarEmpresa, EmpresaDetalle } from "@contable/shared";

/** Usuario autenticado por Supabase; el correo viene en el token. */
export interface UsuarioSesion {
  id: string;
  email?: string;
}

/** Operaciones disponibles dentro de la transacción. */
export interface UnidadEmpresas {
  /**
   * Garantiza que el usuario de Supabase Auth exista en la tabla usuarios (la membresía lo exige).
   * Si no existe lo registra con su correo; sin correo lanza ReglaEmpresaError.
   */
  asegurarUsuario(usuario: UsuarioSesion): Promise<void>;
  /** Registra la empresa. Si el NIT ya existe lanza NitDuplicadoError. */
  crear(datos: CrearEmpresa): Promise<EmpresaDetalle>;
  /** Da al usuario el rol de administrador de la empresa, con acceso a todas sus sucursales. */
  asignarAdministrador(usuarioId: string, empresaId: string): Promise<void>;
  obtener(empresaId: string): Promise<EmpresaDetalle | null>;
  /** Permisos del usuario en la empresa según su rol, o null si no tiene una membresía activa en ella. */
  permisos(usuarioId: string, empresaId: string): Promise<ReadonlySet<string> | null>;
  tienePartidasContabilizadas(empresaId: string): Promise<boolean>;
  /** Aplica los cambios enviados. Si el NIT nuevo ya existe lanza NitDuplicadoError. */
  actualizar(empresaId: string, cambios: EditarEmpresa): Promise<EmpresaDetalle>;
}

/** Puerto de persistencia: todo ocurre en una transacción a nombre del usuario (para la bitácora). */
export interface RepositorioEmpresas {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEmpresas) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_EMPRESAS = Symbol("RepositorioEmpresas");
