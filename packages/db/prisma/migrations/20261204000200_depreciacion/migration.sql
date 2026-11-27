-- Depreciación mensual de los activos fijos (HU-82, S3-T130).
-- Cada fila es la cuota de un activo en un mes y la partida de ajuste que la contabilizó. La clave única
-- (activo, mes) impide depreciar dos veces el mismo mes aunque dos usuarios generen a la vez.

CREATE TABLE "depreciaciones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "activo_id" UUID NOT NULL,
    "mes" DATE NOT NULL,
    "cuota" DECIMAL(14,2) NOT NULL,
    "acumulada" DECIMAL(14,2) NOT NULL,
    "partida_id" UUID NOT NULL,
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciaciones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "depreciaciones_mes_check" CHECK (EXTRACT(DAY FROM "mes") = 1),
    CONSTRAINT "depreciaciones_cuota_check" CHECK ("cuota" > 0 AND "acumulada" >= "cuota")
);

CREATE UNIQUE INDEX "depreciaciones_activo_id_mes_key" ON "depreciaciones"("activo_id", "mes");
CREATE INDEX "depreciaciones_empresa_id_mes_idx" ON "depreciaciones"("empresa_id", "mes");
CREATE INDEX "depreciaciones_partida_id_idx" ON "depreciaciones"("partida_id");

ALTER TABLE "depreciaciones" ADD CONSTRAINT "depreciaciones_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciaciones" ADD CONSTRAINT "depreciaciones_activo_id_fkey"
  FOREIGN KEY ("activo_id") REFERENCES "activos_fijos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciaciones" ADD CONSTRAINT "depreciaciones_partida_id_fkey"
  FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "depreciaciones" IS 'Cuota de depreciación de cada activo fijo por mes, con la partida de ajuste que la contabilizó.';
COMMENT ON COLUMN "depreciaciones"."id" IS 'Identificador de la cuota.';
COMMENT ON COLUMN "depreciaciones"."empresa_id" IS 'Empresa dueña del activo.';
COMMENT ON COLUMN "depreciaciones"."activo_id" IS 'Activo fijo depreciado.';
COMMENT ON COLUMN "depreciaciones"."mes" IS 'Primer día del mes depreciado.';
COMMENT ON COLUMN "depreciaciones"."cuota" IS 'Cuota del mes en dólares (línea recta; la última cuota absorbe el redondeo).';
COMMENT ON COLUMN "depreciaciones"."acumulada" IS 'Depreciación acumulada del activo al cerrar ese mes.';
COMMENT ON COLUMN "depreciaciones"."partida_id" IS 'Partida de ajuste, ya contabilizada, que registró la cuota (una por sucursal y mes).';
COMMENT ON COLUMN "depreciaciones"."creado_por" IS 'Usuario que generó la depreciación.';
COMMENT ON COLUMN "depreciaciones"."creado_en" IS 'Fecha y hora en que se generó.';

CREATE TRIGGER depreciaciones_bitacora AFTER INSERT OR UPDATE OR DELETE ON "depreciaciones"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

-- Las cuotas solo se agregan: una depreciación contabilizada no se edita ni se borra (se corrige con una partida).
CREATE FUNCTION interno.depreciaciones_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las depreciaciones registradas no se modifican ni se borran';
END $$;

REVOKE ALL ON FUNCTION interno.depreciaciones_inmutables() FROM PUBLIC;
COMMENT ON FUNCTION interno.depreciaciones_inmutables() IS 'Trigger de depreciaciones: impide modificar o borrar una cuota ya registrada.';

CREATE TRIGGER depreciaciones_sin_cambios BEFORE UPDATE OR DELETE ON "depreciaciones"
  FOR EACH ROW EXECUTE FUNCTION interno.depreciaciones_inmutables();

ALTER TABLE "depreciaciones" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "depreciaciones" FROM anon, authenticated;
  END IF;
END $$;
