import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MiembroEmpresa } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { useSesionOpcional } from "@/modules/sesion";
import { sucursalesQuery } from "@/modules/organizacion/sucursales/sucursales-api";
import { DialogoAsignarRol } from "./dialogo-asignar-rol";
import { DialogoInvitar } from "./dialogo-invitar";
import { usuariosQuery } from "./usuarios-api";

/**
 * Pantalla de usuarios de la empresa (S1-T48, HU-08): quién tiene acceso, con qué rol y en qué sucursales.
 * Desde aquí se invita por correo y se cambia el rol y las sucursales de cada usuario (S1-T49).
 */
export function PantallaUsuarios({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const { t } = useTranslation("usuarios");
  const usuarios = useQuery(usuariosQuery(empresaId));
  const sucursales = useQuery(sucursalesQuery(empresaId));
  const usuarioSesion = useSesionOpcional()?.usuario ?? null;
  const [invitando, setInvitando] = useState(false);
  const [editando, setEditando] = useState<MiembroEmpresa | null>(null);

  const nombresSucursal = new Map((sucursales.data ?? []).map((s) => [s.id, s.nombre]));
  const activas = (sucursales.data ?? []).filter((s) => s.activa);

  const sucursalesDe = (m: MiembroEmpresa) =>
    m.todasSucursales
      ? t("todasSucursales")
      : m.sucursales.map((id) => nombresSucursal.get(id) ?? t("sucursalDesconocida")).join(", ");

  return (
    <Pagina className="max-w-[1120px]">
      <EncabezadoPagina titulo={t("titulo")} descripcion={t("descripcion")}>
        <Button className="h-11 rounded-full px-5" onClick={() => setInvitando(true)}>
          <UserPlus aria-hidden="true" />
          {t("invitar")}
        </Button>
      </EncabezadoPagina>

      {usuarios.isPending && (
        <p role="status" className="text-muted-foreground">
          {t("cargando")}
        </p>
      )}
      {usuarios.isError && (
        <Alert variant="error">
          <p>
            {t("errorCarga")} {mensajeDeError(usuarios.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void usuarios.refetch()}>
            {t("reintentar")}
          </Button>
        </Alert>
      )}

      {usuarios.isSuccess &&
        (usuarios.data.length === 0 ? (
          <p className="p-10 text-center text-muted-foreground">{t("vacio")}</p>
        ) : (
          <Card className="overflow-hidden">
            <Table className="min-w-[640px]" aria-label={t("titulo")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columnas.usuario")}</TableHead>
                  <TableHead>{t("columnas.rol")}</TableHead>
                  <TableHead>{t("columnas.sucursales")}</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">{t("columnas.acciones")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.data.map((m) => (
                  <TableRow key={m.usuarioId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{m.nombre}</span>
                        {m.usuarioId === usuarioSesion?.id && <Badge variant="contorno">{t("tu")}</Badge>}
                      </div>
                      <span className="text-sm text-muted-foreground">{m.correo}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.rol === "administrador" ? "solida" : "neutra"}>
                        {t(`roles.${m.rol}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{sucursalesDe(m)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={t("cambiarRol", { nombre: m.nombre })}
                        onClick={() => setEditando(m)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}

      <DialogoInvitar
        empresaId={empresaId}
        abierto={invitando}
        sucursales={activas}
        onCerrar={() => setInvitando(false)}
      />
      <DialogoAsignarRol
        empresaId={empresaId}
        miembro={editando}
        esPropio={editando?.usuarioId === usuarioSesion?.id}
        sucursales={activas}
        onCerrar={() => setEditando(null)}
      />
    </Pagina>
  );
}
