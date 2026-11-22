import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AsignarRolUsuario, InvitarUsuario, MiembroEmpresa } from "@contable/shared";
import { api } from "@/lib/api";
import { permisosQuery } from "@/modules/organizacion/permisos";

const ruta = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/usuarios`;
const clave = (empresaId: string) => ["empresas", empresaId, "usuarios"] as const;

/** Usuarios con membresía activa en la empresa, con su rol y sucursales (HU-08). */
export const usuariosQuery = (empresaId: string) =>
  queryOptions({
    queryKey: clave(empresaId),
    queryFn: ({ signal }) => api<MiembroEmpresa[]>(ruta(empresaId), { senal: signal }),
  });

function useRefrescarUsuarios(empresaId: string) {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: clave(empresaId) });
}

/** Invita por correo y agrega a la empresa con su rol y sucursales (S1-T46). */
export function useInvitarUsuario(empresaId: string) {
  const refrescar = useRefrescarUsuarios(empresaId);
  return useMutation({
    mutationFn: (datos: InvitarUsuario) =>
      api<{ mensaje: string; invitacionEnviada: boolean }>(`${ruta(empresaId)}/invitaciones`, {
        metodo: "POST",
        cuerpo: datos,
      }),
    onSuccess: refrescar,
  });
}

/** Cambia el rol y las sucursales de un usuario de la empresa (S1-T47). */
export function useAsignarRol(empresaId: string) {
  const cliente = useQueryClient();
  const refrescar = useRefrescarUsuarios(empresaId);
  return useMutation({
    mutationFn: ({ usuarioId, datos }: { usuarioId: string; datos: AsignarRolUsuario }) =>
      api<{ mensaje: string }>(`${ruta(empresaId)}/${encodeURIComponent(usuarioId)}`, {
        metodo: "PATCH",
        cuerpo: datos,
      }),
    onSuccess: async () => {
      await refrescar();
      // Si el usuario se cambió a sí mismo, sus permisos cambian con él
      await cliente.invalidateQueries({ queryKey: permisosQuery(empresaId).queryKey });
    },
  });
}
