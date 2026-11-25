-- Toma física de inventario (HU-68, S3-T88). Conserva el conteo y genera movimientos inmutables y una partida
-- de ajuste en borrador al aprobar. Una toma no se elimina ni se edita después de su aprobación.

CREATE TYPE "estado_toma_fisica" AS ENUM ('en_conteo', 'aprobada');

CREATE TABLE "tomas_fisicas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "estado_toma_fisica" NOT NULL DEFAULT 'en_conteo',
    "partida_id" UUID,
    "creado_por" UUID NOT NULL,
    "aprobado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobado_en" TIMESTAMPTZ(6),
    CONSTRAINT "tomas_fisicas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tomas_fisicas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tomas_fisicas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tomas_fisicas_partida_id_fkey" FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tomas_fisicas_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tomas_fisicas_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "tomas_fisicas_detalles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "toma_fisica_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "existencia_sistema" DECIMAL(14,4) NOT NULL,
    "secuencia_sistema" BIGINT NOT NULL,
    "cantidad_contada" DECIMAL(14,4),
    "series_contadas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cantidad_faltante" DECIMAL(14,4),
    "cantidad_sobrante" DECIMAL(14,4),
    "valor_faltante" DECIMAL(14,2),
    "valor_sobrante" DECIMAL(14,2),
    "valor_final" DECIMAL(14,2),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tomas_fisicas_detalles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tomas_fisicas_detalles_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tomas_fisicas_detalles_toma_fisica_id_fkey" FOREIGN KEY ("toma_fisica_id") REFERENCES "tomas_fisicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tomas_fisicas_detalles_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tomas_fisicas_detalles_existencia_no_negativa" CHECK ("existencia_sistema" >= 0),
    CONSTRAINT "tomas_fisicas_detalles_secuencia_no_negativa" CHECK ("secuencia_sistema" >= 0),
    CONSTRAINT "tomas_fisicas_detalles_cantidad_no_negativa" CHECK ("cantidad_contada" IS NULL OR "cantidad_contada" >= 0),
    CONSTRAINT "tomas_fisicas_detalles_cantidad_faltante_no_negativa" CHECK ("cantidad_faltante" IS NULL OR "cantidad_faltante" >= 0),
    CONSTRAINT "tomas_fisicas_detalles_cantidad_sobrante_no_negativa" CHECK ("cantidad_sobrante" IS NULL OR "cantidad_sobrante" >= 0),
    CONSTRAINT "tomas_fisicas_detalles_valor_faltante_no_negativo" CHECK ("valor_faltante" IS NULL OR "valor_faltante" >= 0),
    CONSTRAINT "tomas_fisicas_detalles_valor_sobrante_no_negativo" CHECK ("valor_sobrante" IS NULL OR "valor_sobrante" >= 0),
    CONSTRAINT "tomas_fisicas_detalles_valor_no_negativo" CHECK ("valor_final" IS NULL OR "valor_final" >= 0),
    CONSTRAINT "tomas_fisicas_detalles_toma_producto_unq" UNIQUE ("toma_fisica_id", "producto_id")
);

CREATE UNIQUE INDEX "tomas_fisicas_una_abierta_por_sucursal_unq"
  ON "tomas_fisicas" ("empresa_id", "sucursal_id") WHERE "estado" = 'en_conteo';
CREATE UNIQUE INDEX "tomas_fisicas_partida_id_unq" ON "tomas_fisicas" ("partida_id");
CREATE INDEX "tomas_fisicas_empresa_sucursal_fecha_idx" ON "tomas_fisicas" ("empresa_id", "sucursal_id", "fecha");
CREATE INDEX "tomas_fisicas_detalles_empresa_producto_idx" ON "tomas_fisicas_detalles" ("empresa_id", "producto_id");

COMMENT ON TABLE "tomas_fisicas" IS 'Conteo físico de productos en una sucursal. Al aprobar crea movimientos de ajuste y una partida contable en borrador.';
COMMENT ON COLUMN "tomas_fisicas"."id" IS 'Identificador de la toma física.';
COMMENT ON COLUMN "tomas_fisicas"."empresa_id" IS 'Empresa propietaria de la toma.';
COMMENT ON COLUMN "tomas_fisicas"."sucursal_id" IS 'Sucursal que se cuenta.';
COMMENT ON COLUMN "tomas_fisicas"."fecha" IS 'Fecha del conteo y de los movimientos de ajuste.';
COMMENT ON COLUMN "tomas_fisicas"."estado" IS 'En conteo o aprobada; una toma aprobada es inmutable.';
COMMENT ON COLUMN "tomas_fisicas"."partida_id" IS 'Partida de ajuste generada al aprobar, que permanece en borrador.';
COMMENT ON COLUMN "tomas_fisicas"."creado_por" IS 'Usuario auxiliar que inició el conteo.';
COMMENT ON COLUMN "tomas_fisicas"."aprobado_por" IS 'Usuario contador que aprobó el ajuste.';
COMMENT ON COLUMN "tomas_fisicas"."creado_en" IS 'Fecha y hora de inicio del conteo.';
COMMENT ON COLUMN "tomas_fisicas"."actualizado_en" IS 'Fecha y hora de la última modificación del conteo.';
COMMENT ON COLUMN "tomas_fisicas"."aprobado_en" IS 'Fecha y hora de aprobación del ajuste.';

COMMENT ON TABLE "tomas_fisicas_detalles" IS 'Existencia de sistema, conteo físico y valor final por producto.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."id" IS 'Identificador del detalle.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."empresa_id" IS 'Empresa propietaria del producto y de la toma.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."toma_fisica_id" IS 'Toma física a la que pertenece el detalle.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."producto_id" IS 'Producto contado.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."existencia_sistema" IS 'Cantidad del producto en el kardex al iniciar la toma.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."secuencia_sistema" IS 'Última secuencia de movimiento incluida en la existencia inicial.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."cantidad_contada" IS 'Cantidad física informada por el auxiliar; nula mientras no se haya contado.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."series_contadas" IS 'Series o IMEI vistos durante el conteo para productos controlados por serie.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."cantidad_faltante" IS 'Unidades faltantes detectadas en el conteo.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."cantidad_sobrante" IS 'Unidades sobrantes detectadas en el conteo.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."valor_faltante" IS 'Costo de las unidades faltantes contabilizado al aprobar.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."valor_sobrante" IS 'Costo de las unidades sobrantes contabilizado al aprobar.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."valor_final" IS 'Valor contable del inventario del producto después del ajuste aprobado.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."creado_en" IS 'Fecha y hora de creación del detalle.';
COMMENT ON COLUMN "tomas_fisicas_detalles"."actualizado_en" IS 'Fecha y hora del último cambio del conteo.';

CREATE FUNCTION interno.tomas_fisicas_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  partida record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una toma física no se elimina';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'en_conteo' OR NEW.partida_id IS NOT NULL OR NEW.aprobado_por IS NOT NULL OR NEW.aprobado_en IS NOT NULL THEN
      RAISE EXCEPTION 'Una toma física inicia en estado En conteo';
    END IF;
  ELSE
    IF OLD.estado <> 'en_conteo' THEN
      RAISE EXCEPTION 'Una toma física aprobada no admite cambios';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['estado', 'partida_id', 'aprobado_por', 'aprobado_en', 'actualizado_en'])
       <> (to_jsonb(OLD) - ARRAY['estado', 'partida_id', 'aprobado_por', 'aprobado_en', 'actualizado_en']) THEN
      RAISE EXCEPTION 'No se pueden cambiar la empresa, sucursal ni fecha de una toma física';
    END IF;
    IF NEW.estado <> 'aprobada' OR NEW.aprobado_por IS NULL OR NEW.aprobado_en IS NULL THEN
      RAISE EXCEPTION 'La aprobación requiere un usuario y una fecha';
    END IF;
    IF NEW.partida_id IS NOT NULL THEN
      SELECT empresa_id, sucursal_id, estado, origen, origen_id INTO partida
      FROM partidas WHERE id = NEW.partida_id;
      IF NOT FOUND OR partida.empresa_id <> NEW.empresa_id OR partida.sucursal_id <> NEW.sucursal_id
         OR partida.estado <> 'borrador' OR partida.origen <> 'toma_fisica' OR partida.origen_id <> NEW.id THEN
        RAISE EXCEPTION 'La partida de ajuste no corresponde a esta toma física';
      END IF;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa de la toma física';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "tomas_fisicas_validar" BEFORE INSERT OR UPDATE OR DELETE ON "tomas_fisicas"
  FOR EACH ROW EXECUTE FUNCTION interno.tomas_fisicas_validar();

CREATE FUNCTION interno.tomas_fisicas_detalles_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  toma record;
  producto record;
  cantidad_series integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El detalle de una toma física no se elimina';
  END IF;
  SELECT empresa_id, estado INTO toma FROM tomas_fisicas
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.toma_fisica_id ELSE NEW.toma_fisica_id END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la toma física del detalle';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF toma.estado <> 'en_conteo' THEN
      RAISE EXCEPTION 'No se agregan detalles a una toma física aprobada';
    END IF;
    IF NEW.empresa_id <> toma.empresa_id THEN
      RAISE EXCEPTION 'El detalle no pertenece a la empresa de la toma física';
    END IF;
    SELECT empresa_id, controla_series INTO producto FROM productos WHERE id = NEW.producto_id;
    IF NOT FOUND OR producto.empresa_id <> NEW.empresa_id THEN
      RAISE EXCEPTION 'El producto no pertenece a la empresa de la toma física';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['cantidad_contada', 'series_contadas', 'cantidad_faltante', 'cantidad_sobrante', 'valor_faltante', 'valor_sobrante', 'valor_final', 'actualizado_en'])
       <> (to_jsonb(OLD) - ARRAY['cantidad_contada', 'series_contadas', 'cantidad_faltante', 'cantidad_sobrante', 'valor_faltante', 'valor_sobrante', 'valor_final', 'actualizado_en']) THEN
      RAISE EXCEPTION 'No se puede cambiar la existencia de sistema ni el producto del detalle';
    END IF;
    IF toma.estado = 'aprobada' THEN
      IF OLD.valor_final IS NOT NULL OR NEW.valor_final IS NULL
         OR (to_jsonb(NEW) - ARRAY['cantidad_faltante', 'cantidad_sobrante', 'valor_faltante', 'valor_sobrante', 'valor_final', 'actualizado_en'])
            <> (to_jsonb(OLD) - ARRAY['cantidad_faltante', 'cantidad_sobrante', 'valor_faltante', 'valor_sobrante', 'valor_final', 'actualizado_en']) THEN
        RAISE EXCEPTION 'El detalle de una toma física aprobada es inmutable';
      END IF;
    ELSIF toma.estado <> 'en_conteo'
       OR NEW.cantidad_faltante IS DISTINCT FROM OLD.cantidad_faltante
       OR NEW.cantidad_sobrante IS DISTINCT FROM OLD.cantidad_sobrante
       OR NEW.valor_faltante IS DISTINCT FROM OLD.valor_faltante
       OR NEW.cantidad_faltante IS DISTINCT FROM OLD.cantidad_faltante
       OR NEW.cantidad_sobrante IS DISTINCT FROM OLD.cantidad_sobrante
       OR NEW.valor_sobrante IS DISTINCT FROM OLD.valor_sobrante
       OR NEW.valor_final IS DISTINCT FROM OLD.valor_final THEN
      RAISE EXCEPTION 'El valor final solo se fija al aprobar la toma física';
    END IF;
    SELECT controla_series INTO producto FROM productos WHERE id = NEW.producto_id;
  END IF;
  IF NEW.cantidad_contada IS NOT NULL AND producto.controla_series THEN
    cantidad_series := cardinality(coalesce(NEW.series_contadas, ARRAY[]::text[]));
    IF NEW.cantidad_contada <> trunc(NEW.cantidad_contada) OR cantidad_series <> NEW.cantidad_contada THEN
      RAISE EXCEPTION 'Registra una serie por cada unidad contada';
    END IF;
    IF cantidad_series <> (SELECT count(DISTINCT s) FROM unnest(NEW.series_contadas) AS s) THEN
      RAISE EXCEPTION 'No repitas una serie en el conteo';
    END IF;
  ELSIF NOT producto.controla_series AND cardinality(NEW.series_contadas) > 0 THEN
    RAISE EXCEPTION 'Este producto no controla series';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "tomas_fisicas_detalles_validar" BEFORE INSERT OR UPDATE OR DELETE ON "tomas_fisicas_detalles"
  FOR EACH ROW EXECUTE FUNCTION interno.tomas_fisicas_detalles_validar();

CREATE FUNCTION interno.tomas_fisicas_aprobada_revisar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cantidad_detalles integer;
  cantidad_incompleta integer;
  valor_faltantes numeric(14,2);
  valor_sobrantes numeric(14,2);
  debe_inventario numeric(14,2);
  haber_inventario numeric(14,2);
BEGIN
  IF NEW.estado <> 'aprobada' THEN
    RETURN NEW;
  END IF;
  SELECT count(*), count(*) FILTER (WHERE cantidad_contada IS NULL OR valor_final IS NULL),
         coalesce(sum(valor_faltante), 0), coalesce(sum(valor_sobrante), 0)
  INTO cantidad_detalles, cantidad_incompleta, valor_faltantes, valor_sobrantes
  FROM tomas_fisicas_detalles WHERE toma_fisica_id = NEW.id AND empresa_id = NEW.empresa_id;
  IF cantidad_detalles = 0 OR cantidad_incompleta > 0 THEN
    RAISE EXCEPTION 'Completa todos los conteos y valores finales antes de aprobar';
  END IF;
  IF NEW.partida_id IS NULL THEN
    IF valor_faltantes > 0 OR valor_sobrantes > 0 THEN
      RAISE EXCEPTION 'La toma física necesita una partida para registrar su ajuste';
    END IF;
    RETURN NEW;
  END IF;
  IF valor_faltantes = 0 AND valor_sobrantes = 0 THEN
    RAISE EXCEPTION 'No se crea una partida cuando no hay ajuste con valor';
  END IF;
  SELECT coalesce(sum(d.debe) FILTER (WHERE c.codigo = '1109'), 0),
         coalesce(sum(d.haber) FILTER (WHERE c.codigo = '1109'), 0)
  INTO debe_inventario, haber_inventario
  FROM partida_detalles d JOIN cuentas c ON c.id = d.cuenta_id
  WHERE d.partida_id = NEW.partida_id AND c.empresa_id = NEW.empresa_id;
  IF debe_inventario <> valor_sobrantes OR haber_inventario <> valor_faltantes THEN
    RAISE EXCEPTION 'La partida no coincide con los sobrantes y faltantes de la toma física';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER "tomas_fisicas_aprobada_revisar"
  AFTER UPDATE ON "tomas_fisicas" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION interno.tomas_fisicas_aprobada_revisar();

REVOKE ALL ON FUNCTION interno.tomas_fisicas_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.tomas_fisicas_detalles_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.tomas_fisicas_aprobada_revisar() FROM PUBLIC;

CREATE TRIGGER "tomas_fisicas_actualizado_en" BEFORE UPDATE ON "tomas_fisicas"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "tomas_fisicas_detalles_actualizado_en" BEFORE UPDATE ON "tomas_fisicas_detalles"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "tomas_fisicas_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "tomas_fisicas"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "tomas_fisicas_detalles_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "tomas_fisicas_detalles"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

ALTER TABLE "tomas_fisicas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tomas_fisicas_detalles" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "tomas_fisicas", "tomas_fisicas_detalles" FROM anon, authenticated;
  END IF;
END $$;
