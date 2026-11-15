import { SetMetadata } from "@nestjs/common";

export const PERMISO_REQUERIDO = "contable:permiso-requerido";

/** Declara el permiso de la matriz que requiere un handler o controlador. */
export const Permiso = (permiso: string) => SetMetadata(PERMISO_REQUERIDO, permiso);
