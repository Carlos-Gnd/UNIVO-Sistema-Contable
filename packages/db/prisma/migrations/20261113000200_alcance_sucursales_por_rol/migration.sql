-- Alcance por sucursal según el rol (HU-08): el administrador y el contador ven todas las sucursales de la
-- empresa; el auxiliar y el usuario de consulta, solo las que tienen asignadas en membresia_sucursales.
--
-- La API ya lo aplica al registrar la empresa, invitar y asignar roles. Aquí se garantiza en la base: así
-- nunca existe, por ejemplo, un administrador limitado a una sucursal que pudiera gestionar las demás.
-- Los ids de los roles son fijos (migración 20261110000200_roles_y_permisos): 1 administrador, 2 contador.
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_alcance_por_rol"
  CHECK ("todas_sucursales" = ("rol_id" IN (1, 2)));

COMMENT ON CONSTRAINT "membresias_alcance_por_rol" ON "membresias" IS
  'Administrador (1) y contador (2) ven todas las sucursales; auxiliar y consulta solo las asignadas.';
