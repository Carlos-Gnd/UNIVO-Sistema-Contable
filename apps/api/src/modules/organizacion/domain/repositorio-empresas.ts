import type {
  CrearEmpresa,
  CrearSucursal,
  EditarEmpresa,
  EditarSucursal,
  EmpresaDetalle,
  SucursalDetalle,
} from "@contable/shared";

/** Usuario autenticado por Supabase; el correo viene en el token. */
export interface UsuarioSesion {
  id: string;
  email?: string;
}

/** Datos de la empresa sin la casa matriz, que se guarda como sucursal. */
export type DatosEmpresa = Omit<CrearEmpresa, "casaMatriz">;

/** Sucursales que el usuario puede ver según su membresía. */
export interface AccesoSucursales {
  todas: boolean;
  asignadas: readonly string[];
}

/** Operaciones disponibles dentro de la transacción (empresas y sus sucursales). */
export interface UnidadEmpresas {
  /**
   * Garantiza que el usuario de Supabase Auth exista en la tabla usuarios (la membresía lo exige).
   * Si no existe lo registra con su correo; sin correo lanza ReglaEmpresaError.
   */
  asegurarUsuario(usuario: UsuarioSesion): Promise<void>;
  /** Registra la empresa. Si el NIT ya existe lanza NitDuplicadoError. */
  crear(datos: DatosEmpresa): Promise<EmpresaDetalle>;
  /**
   * Copia el catálogo de cuentas de la clase según el tipo de contribuyente de la empresa
   * (165 cuentas para sociedad y 160 para persona natural). Devuelve cuántas copió.
   */
  copiarCatalogoBase(empresaId: string): Promise<number>;
  /** Da al usuario el rol de administrador de la empresa, con acceso a todas sus sucursales. */
  asignarAdministrador(usuarioId: string, empresaId: string): Promise<void>;
  obtener(empresaId: string): Promise<EmpresaDetalle | null>;
  /** Permisos del usuario en la empresa según su rol, o null si no tiene una membresía activa en ella. */
  permisos(usuarioId: string, empresaId: string): Promise<ReadonlySet<string> | null>;
  tienePartidasContabilizadas(empresaId: string): Promise<boolean>;
  /** Aplica los cambios enviados. Si el NIT nuevo ya existe lanza NitDuplicadoError. */
  actualizar(empresaId: string, cambios: EditarEmpresa): Promise<EmpresaDetalle>;

  /** Sucursales asignadas al usuario en la empresa (o todas). */
  accesoSucursales(usuarioId: string, empresaId: string): Promise<AccesoSucursales>;
  /** Sucursales de la empresa, la matriz primero y luego por código. */
  listarSucursales(empresaId: string): Promise<SucursalDetalle[]>;
  /** La sucursal, si existe y pertenece a la empresa. */
  obtenerSucursal(empresaId: string, sucursalId: string): Promise<SucursalDetalle | null>;
  /** Registra una sucursal. Si los códigos ya existen en la empresa lanza CodigoSucursalDuplicadoError. */
  crearSucursal(empresaId: string, datos: CrearSucursal, esMatriz: boolean): Promise<SucursalDetalle>;
  /** true si alguna partida (en cualquier estado) se registró en la sucursal. */
  sucursalTieneMovimientos(sucursalId: string): Promise<boolean>;
  /** Aplica los cambios. Si los códigos nuevos ya existen lanza CodigoSucursalDuplicadoError. */
  actualizarSucursal(actual: SucursalDetalle, cambios: EditarSucursal): Promise<SucursalDetalle>;
}

/** Puerto de persistencia: todo ocurre en una transacción a nombre del usuario (para la bitácora). */
export interface RepositorioEmpresas {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEmpresas) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_EMPRESAS = Symbol("RepositorioEmpresas");
