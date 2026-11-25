-- Partidas recurrentes (HU-26, S3-T04): plantillas creadas desde una partida y generación del borrador del mes.
-- Una plantilla genera como máximo una partida activa por mes; las anuladas permiten volver a generarla.

CREATE TABLE "plantillas_recurrentes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "concepto" VARCHAR(300),
    "tipo" "tipo_partida" NOT NULL DEFAULT 'operacion',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantillas_recurrentes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plantillas_recurrentes_nombre_no_vacio" CHECK (btrim("nombre") <> '')
);

CREATE UNIQUE INDEX "plantillas_recurrentes_id_empresa_id_key" ON "plantillas_recurrentes"("id", "empresa_id");
CREATE UNIQUE INDEX "plantillas_recurrentes_empresa_id_nombre_key" ON "plantillas_recurrentes"("empresa_id", "nombre");

ALTER TABLE "plantillas_recurrentes" ADD CONSTRAINT "plantillas_recurrentes_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plantillas_recurrentes" ADD CONSTRAINT "plantillas_recurrentes_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "plantilla_recurrente_lineas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "plantilla_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "debe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "plantilla_recurrente_lineas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plantilla_recurrente_lineas_importe_valido" CHECK (
      "debe" >= 0 AND "haber" >= 0 AND ("debe" = 0 OR "haber" = 0) AND "debe" + "haber" > 0
    )
);

CREATE UNIQUE INDEX "plantilla_recurrente_lineas_plantilla_id_orden_key"
  ON "plantilla_recurrente_lineas"("plantilla_id", "orden");

ALTER TABLE "plantilla_recurrente_lineas" ADD CONSTRAINT "plantilla_recurrente_lineas_plantilla_fkey"
  FOREIGN KEY ("plantilla_id", "empresa_id") REFERENCES "plantillas_recurrentes"("id", "empresa_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plantilla_recurrente_lineas" ADD CONSTRAINT "plantilla_recurrente_lineas_cuenta_id_fkey"
  FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una partida recurrente activa por plantilla y mes (origen_id es el id de la plantilla)
CREATE UNIQUE INDEX "partidas_recurrente_mes_unq" ON "partidas"(
  "empresa_id", "origen_id", (EXTRACT(YEAR FROM "fecha")::int), (EXTRACT(MONTH FROM "fecha")::int)
) WHERE "origen" = 'recurrente' AND "estado" <> 'anulada' AND "origen_id" IS NOT NULL;

COMMENT ON TABLE "plantillas_recurrentes" IS 'Plantillas de partidas que se repiten cada mes; generan borradores, nunca partidas contabilizadas.';
COMMENT ON COLUMN "plantillas_recurrentes"."id" IS 'Identificador de la plantilla.';
COMMENT ON COLUMN "plantillas_recurrentes"."empresa_id" IS 'Empresa dueña de la plantilla.';
COMMENT ON COLUMN "plantillas_recurrentes"."sucursal_id" IS 'Sucursal en la que se generan las partidas.';
COMMENT ON COLUMN "plantillas_recurrentes"."nombre" IS 'Nombre único por empresa, por ejemplo «Alquiler del local».';
COMMENT ON COLUMN "plantillas_recurrentes"."concepto" IS 'Concepto que llevará cada partida generada.';
COMMENT ON COLUMN "plantillas_recurrentes"."tipo" IS 'Tipo de las partidas generadas.';
COMMENT ON COLUMN "plantillas_recurrentes"."activa" IS 'Una plantilla inactiva no genera partidas.';
COMMENT ON COLUMN "plantillas_recurrentes"."creado_en" IS 'Fecha y hora de creación.';
COMMENT ON COLUMN "plantillas_recurrentes"."actualizado_en" IS 'Fecha y hora de la última modificación.';
COMMENT ON TABLE "plantilla_recurrente_lineas" IS 'Líneas de debe y haber de una plantilla recurrente.';
COMMENT ON COLUMN "plantilla_recurrente_lineas"."id" IS 'Identificador de la línea.';
COMMENT ON COLUMN "plantilla_recurrente_lineas"."empresa_id" IS 'Empresa dueña de la línea.';
COMMENT ON COLUMN "plantilla_recurrente_lineas"."plantilla_id" IS 'Plantilla a la que pertenece.';
COMMENT ON COLUMN "plantilla_recurrente_lineas"."cuenta_id" IS 'Cuenta imputable de la línea.';
COMMENT ON COLUMN "plantilla_recurrente_lineas"."debe" IS 'Importe al debe, en dólares.';
COMMENT ON COLUMN "plantilla_recurrente_lineas"."haber" IS 'Importe al haber, en dólares.';
COMMENT ON COLUMN "plantilla_recurrente_lineas"."orden" IS 'Posición de la línea dentro de la partida.';

CREATE FUNCTION interno.plantillas_recurrentes_validar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales s WHERE s.id = NEW.sucursal_id AND s.empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION interno.plantilla_lineas_validar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cuentas c WHERE c.id = NEW.cuenta_id AND c.empresa_id = NEW.empresa_id
      AND NOT EXISTS (SELECT 1 FROM cuentas h WHERE h.empresa_id = c.empresa_id AND h.cuenta_padre_id = c.id)
  ) THEN
    RAISE EXCEPTION 'La cuenta de la línea no existe en esta empresa o no es imputable.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION interno.plantillas_recurrentes_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.plantilla_lineas_validar() FROM PUBLIC;

CREATE TRIGGER "plantillas_recurrentes_validar_antes" BEFORE INSERT OR UPDATE OF empresa_id, sucursal_id ON "plantillas_recurrentes"
  FOR EACH ROW EXECUTE FUNCTION interno.plantillas_recurrentes_validar();
CREATE TRIGGER "plantilla_lineas_validar_antes" BEFORE INSERT OR UPDATE OF empresa_id, cuenta_id ON "plantilla_recurrente_lineas"
  FOR EACH ROW EXECUTE FUNCTION interno.plantilla_lineas_validar();
CREATE TRIGGER "plantillas_recurrentes_actualizado" BEFORE UPDATE ON "plantillas_recurrentes"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "plantillas_recurrentes_bitacora" AFTER INSERT OR UPDATE ON "plantillas_recurrentes"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "plantilla_recurrente_lineas_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "plantilla_recurrente_lineas"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

ALTER TABLE "plantillas_recurrentes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plantilla_recurrente_lineas" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "plantillas_recurrentes", "plantilla_recurrente_lineas" FROM anon, authenticated;
  END IF;
END $$;
