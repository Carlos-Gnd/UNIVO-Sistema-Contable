-- HU-72, S3-T100: una sola partida de planilla por empresa, sucursal y fecha del período.
-- La partida en borrador se actualiza al recalcular; las contabilizadas no se duplican; una anulada permite recalcular el período.
CREATE UNIQUE INDEX partidas_planilla_sucursal_fecha_unq
  ON partidas (empresa_id, sucursal_id, fecha)
  WHERE origen = 'planilla' AND estado <> 'anulada';

COMMENT ON INDEX partidas_planilla_sucursal_fecha_unq IS
  'HU-72: evita duplicar la partida de planilla de una misma empresa, sucursal y período.';
