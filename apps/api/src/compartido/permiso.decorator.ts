import { SetMetadata } from "@nestjs/common";

export const PERMISO_REQUERIDO = "contable:permiso-requerido";

/** Declara el permiso de la matriz que requiere un handler o controlador. */
export const Permiso = (permiso: string) => SetMetadata(PERMISO_REQUERIDO, permiso);

export const AUTORIZA_EN_CASO_DE_USO = "contable:autoriza-en-caso-de-uso";

/**
 * Declara que la ruta no usa la matriz de permisos en el guard porque su caso de uso valida el acceso
 * (por ejemplo la membresía y las sucursales del usuario). El motivo queda escrito junto a la ruta.
 * Una ruta sin @Permiso, sin @Public y sin esta marca se niega: ninguna ruta nueva queda abierta por olvido.
 */
export const AutorizaEnCasoDeUso = (motivo: string) => SetMetadata(AUTORIZA_EN_CASO_DE_USO, motivo);
