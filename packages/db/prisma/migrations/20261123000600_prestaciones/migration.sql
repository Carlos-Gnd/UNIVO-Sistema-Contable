-- HU-74, S3-T106: evita duplicar la partida mensual de provisiones de prestaciones por empresa y sucursal.
CREATE UNIQUE INDEX partidas_prestaciones_sucursal_fecha_unq
  ON partidas (empresa_id, sucursal_id, fecha)
  WHERE origen = 'prestaciones' AND estado <> 'anulada';

COMMENT ON INDEX partidas_prestaciones_sucursal_fecha_unq IS
  'HU-74: evita duplicar la provisión mensual de prestaciones de una misma empresa y sucursal; una anulada permite recalcular.';
